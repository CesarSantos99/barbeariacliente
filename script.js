// Executa também quando o site é aberto direto como arquivo local (file://).
(async function startClinicSite() {
const firebaseConfig = window.CLINIC_FIREBASE_CONFIG || {
  apiKey: "AIzaSyBhRlqzsXI9ZtWe5Gj2S2BMPVKsiKw549s",
  authDomain: "agendamentobarbearia50kdemo.firebaseapp.com",
  projectId: "agendamentobarbearia50kdemo",
  storageBucket: "agendamentobarbearia50kdemo.firebasestorage.app",
  messagingSenderId: "619851119582",
  appId: "1:619851119582:web:88a26a1d8fdd9eb9613b4f"
};
const hasFirebase = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
let db = null;
let initializeFirestoreForClinic, doc, getDoc, serverTimestamp, collection, getDocs, runTransaction;
if (hasFirebase) {
  const [{ initializeApp }, firestore] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
  ]);
  ({ initializeFirestore: initializeFirestoreForClinic, doc, getDoc, serverTimestamp, collection, getDocs, runTransaction } = firestore);
  const app = initializeApp(firebaseConfig);
  db = initializeFirestoreForClinic(app, { experimentalAutoDetectLongPolling: true });
}

const SEED_DOCTORS = [
  // IDs, horários e intervalos ficam estáveis para preservar a compatibilidade das reservas existentes.
  { id: 'dr-pedro-almeida', nome: 'Pedro Almeida', especialidade: 'Cortes clássicos', colecao: 'reservas_pedro_almeida', fotoUrl: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=800&q=85', inicio: '09:00', fim: '17:00', dias: [1,2,3,4,5], intervalo: 30 },
  { id: 'dra-marina-costa', nome: 'André Costa', especialidade: 'Barba & acabamento', colecao: 'reservas_andre_costa', fotoUrl: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=800&q=85', inicio: '08:00', fim: '16:00', dias: [1,2,3,4,5], intervalo: 30 },
  { id: 'dr-rafael-mendes', nome: 'Rafael Mendes', especialidade: 'Fade & tesoura', colecao: 'reservas_rafael_mendes', fotoUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=85', inicio: '08:30', fim: '15:30', dias: [1,2,3,4,5,6], intervalo: 30 }
];
const LOCAL_BOOKINGS_KEY = 'clinica-horizonte-consultas-v1'; // Mantido para não perder reservas locais já registradas.
const localGet = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const localSet = (key, value) => localStorage.setItem(key, JSON.stringify(value));
let doctors = [];
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clinicDate = ymd => new Date(`${ymd}T12:00:00`).toLocaleDateString('pt-BR');
$('connectionNotice').hidden=hasFirebase;

let bookingSchedule = { weekdays: [1,2,3,4,5], inicio: '09:00', fim: '19:00', intervalo: 30, breakStart: '', breakEnd: '' };

async function loadDoctors() {
  if (!db) {
    doctors = SEED_DOCTORS.map(doctor => ({ ...doctor, dias: [...doctor.dias] }));
    renderDoctors();
    return;
  }
  try {
    const [professionalsSnap, hoursSnap, weekSnap] = await Promise.all([
      getDocs(collection(db, 'profissionais')),
      getDoc(doc(db, 'config', 'horarios')),
      getDoc(doc(db, 'config', 'semana'))
    ]);
    const hours = hoursSnap.exists() ? hoursSnap.data() : {};
    const week = weekSnap.exists() ? weekSnap.data() : {};
    bookingSchedule = {
      weekdays: Array.isArray(week.weekdays) ? week.weekdays : [1,2,3,4,5],
      inicio: week.dayStart || hours.inicio || '09:00',
      fim: week.dayEnd || hours.fim || '19:00',
      intervalo: 30,
      breakStart: hours.breakStart || '',
      breakEnd: hours.breakEnd || ''
    };
    const activeProfessionals = professionalsSnap.docs
      .map(s => ({ id: s.id, ...s.data() }))
      .filter(p => p.nome && p.ativo !== false)
      .map(p => ({
        id: p.id,
        nome: p.nome,
        especialidade: p.especialidade || 'Barbeiro',
        colecao: p.colecao || `reservas_${slugify(p.nome)}`,
        fotoUrl: p.fotoUrl || '',
        inicio: p.inicio || bookingSchedule.inicio,
        fim: p.fim || bookingSchedule.fim,
        dias: [...bookingSchedule.weekdays],
        intervalo: 30
      }));
    doctors = activeProfessionals.length ? activeProfessionals : [{
      id: 'rodrigotorre2', nome: 'Rodrigo Torre2', especialidade: 'Barbeiro',
      colecao: 'reservas_rodrigotorre2', fotoUrl: '', inicio: bookingSchedule.inicio,
      fim: bookingSchedule.fim, dias: [...bookingSchedule.weekdays], intervalo: 30,
      isFallback: true
    }];
    renderDoctors();
  } catch (error) {
    console.error('Não foi possível carregar a agenda do painel:', error);
    const notice = $('connectionNotice');
    notice.hidden = false;
    notice.textContent = 'Não foi possível conectar à agenda agora. Atualize a página antes de solicitar um horário.';
    $('bookButton').disabled = true;
    $('doctorSelect').innerHTML = '<option value="">Agenda indisponível</option>';
    $('doctorSelect').disabled = true;
    $('appointmentDate').disabled = true;
    $('appointmentTime').disabled = true;
  }
}

function slugify(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function renderDoctors() {
  const container=$('profissionaisContainer');
  container.innerHTML=doctors.map(d=>`<article class="doctor-card"><div class="doctor-photo"><img src="${esc(d.fotoUrl)}" alt="Foto demonstrativa do barbeiro ${esc(d.nome)}" loading="lazy" onerror="this.onerror=null;this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 320%22%3E%3Crect width=%22400%22 height=%22320%22 fill=%22%232b2923%22/%3E%3Ccircle cx=%22200%22 cy=%22118%22 r=%2260%22 fill=%22%238f754f%22/%3E%3Cpath d=%22M85 320c8-88 53-132 115-132s107 44 115 132%22 fill=%22%23c99b55%22/%3E%3C/svg%3E'"></div><div class="doctor-info"><span class="doctor-specialty">${esc(d.especialidade)}</span><h3>${esc(d.nome)}</h3><p class="doctor-hours"><i class="bx bx-time-five"></i> ${esc(d.inicio)}–${esc(d.fim)} · ${esc(formatDays(d.dias))}</p><a class="btn btn-primary" href="#agendar" data-select-doctor="${esc(d.id)}">Agendar com ${esc(d.nome.split(' ')[0])} <i class="bx bx-right-arrow-alt"></i></a></div></article>`).join('');
  const options=doctors.map(d=>`<option value="${esc(d.id)}">${esc(d.nome)} — ${esc(d.especialidade)}</option>`).join('');
  $('doctorSelect').innerHTML='<option value="">Selecione um barbeiro</option>'+options;
  container.querySelectorAll('[data-select-doctor]').forEach(a=>a.addEventListener('click',()=>{ $('doctorSelect').value=a.dataset.selectDoctor; refreshTimeOptions(); }));
}
function formatDays(days) { const names=['dom','seg','ter','qua','qui','sex','sáb']; return (days||[]).map(n=>names[n]).join(', '); }
function slotsFor(doctor,date,override={}) {
  if (!date || !doctor) return [];
  const day=new Date(`${date}T12:00:00`).getDay();
  if (!(override.weekdays || doctor.dias || []).includes(day)) return [];
  const startText=override.inicio || doctor.inicio, endText=override.fim || doctor.fim;
  const [sh,sm]=startText.split(':').map(Number), [eh,em]=endText.split(':').map(Number);
  const start=sh*60+sm, end=eh*60+em, step=Number(override.intervalo || doctor.intervalo)||30, out=[];
  const breakStart=override.breakStart ? override.breakStart.split(':').map(Number).reduce((h,m)=>h*60+m,0) : null;
  const breakEnd=override.breakEnd ? override.breakEnd.split(':').map(Number).reduce((h,m)=>h*60+m,0) : null;
  const now=new Date();
  for(let t=start;t+step<=end;t+=step) {
    if (breakStart !== null && breakEnd !== null && t < breakEnd && t+step > breakStart) continue;
    const slot=`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
    if(date!==localYMD(now) || t>now.getHours()*60+now.getMinutes()) out.push(slot);
  }
  return out;
}
async function availableSlots(doctor,date) {
  if (!db) return slotsFor(doctor,date);
  const [generalSnap, profSnap] = await Promise.all([
    getDoc(doc(db, 'config', 'excecoes', 'dias', date)),
    doctor.isFallback
      ? Promise.resolve(null)
      : getDoc(doc(db, 'profissionais', doctor.id, 'excecoes', date))
  ]);
  const general=generalSnap.exists() ? generalSnap.data() : {};
  const professional=profSnap?.exists() ? profSnap.data() : {};
  if (professional.fechado === true || general.fechado === true) return [];
  const exceptionStart=professional.inicio || general.inicio || '';
  const exceptionEnd=professional.fim || general.fim || '';
  const day=new Date(`${date}T12:00:00`).getDay();
  if (!bookingSchedule.weekdays.includes(day) && !(exceptionStart && exceptionEnd)) return [];
  return slotsFor(doctor,date,{
    weekdays: [day],
    inicio: exceptionStart || bookingSchedule.inicio,
    fim: exceptionEnd || bookingSchedule.fim,
    intervalo: bookingSchedule.intervalo,
    breakStart: bookingSchedule.breakStart,
    breakEnd: bookingSchedule.breakEnd
  });
}
function localYMD(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
async function listBookings() {
  if (db) {
    try {
      const groups=await Promise.all(doctors.map(async d=>{
        const col=d.colecao || `reservas_${d.id}`;
        const snap=await getDocs(collection(db,col));
        return snap.docs.map(s=>({id:s.id,doctorId:d.id,...s.data(),_collection:col}));
      }));
      return groups.flat();
    } catch(e) { console.error('Falha ao carregar consultas:',e); }
  }
  return localGet(LOCAL_BOOKINGS_KEY,[]);
}
async function dateBookings(doctor,date) {
  const bookings=await listBookings();
  return bookings.filter(b=>b._collection===doctor.colecao && b.data===date && b.status!=='cancelled');
}
let availabilityRequestId = 0;
async function refreshTimeOptions() {
  const requestId = ++availabilityRequestId;
  const doctor=doctors.find(d=>d.id===$('doctorSelect').value), date=$('appointmentDate').value, select=$('appointmentTime');
  const hint=$('availabilityHint');
  if(hint) hint.textContent=doctor?`Atendimento: ${formatDays(doctor.dias)} · ${doctor.inicio} às ${doctor.fim} · horários em intervalos de 30 minutos.`:'Selecione um barbeiro e uma data para consultar os dias e horários disponíveis.';
  if (!doctor || !date) { select.disabled=true;select.innerHTML='<option value="">Escolha barbeiro e data</option>';return; }
  const today=new Date();today.setHours(0,0,0,0);
  if (new Date(`${date}T00:00:00`)<today) { select.disabled=true;select.innerHTML='<option value="">Escolha uma data futura</option>';return; }
  const slots=await availableSlots(doctor,date);
    if (!slots.length) {
    select.disabled=true;
    select.innerHTML='<option value="">Sem atendimento nesta data; escolha outro dia</option>';
    return;
  }
  const paintOptions=(available,selected='')=>{
    select.innerHTML='<option value="">Selecione um horário</option>'+available.map(s=>`<option value="${s}">${s}</option>`).join('');
    select.disabled=!available.length;
    if(available.includes(selected)) select.value=selected;
    else if(!available.length) select.innerHTML='<option value="">Todos os horários já foram reservados</option>';
  };
  // Exibe imediatamente os horários da agenda; a consulta às reservas não bloqueia o seletor.
  paintOptions(slots,select.value);
  try {
    const reserved=await dateBookings(doctor,date);
    if (requestId !== availabilityRequestId) return;
    const selected=select.value;
    const busy=new Set(reserved.map(b=>b.hora));
    paintOptions(slots.filter(s=>!busy.has(s)),selected);
  } catch(error) {
    console.warn('Não foi possível atualizar reservas; mantendo os horários da agenda:',error);
  }
}
$('doctorSelect').addEventListener('change',refreshTimeOptions);
$('appointmentDate').addEventListener('change',refreshTimeOptions);
$('appointmentDate').addEventListener('input',refreshTimeOptions);
const today=new Date();
let firstClinicDay=new Date(today.getFullYear(),today.getMonth(),today.getDate()+1);
while(firstClinicDay.getDay()===0 || firstClinicDay.getDay()===6) firstClinicDay.setDate(firstClinicDay.getDate()+1);
$('appointmentDate').min=localYMD(today);
$('appointmentDate').value=localYMD(firstClinicDay);
$('bookingForm').addEventListener('submit',async event=>{
  event.preventDefault();const doctor=doctors.find(d=>d.id===$('doctorSelect').value),date=$('appointmentDate').value,time=$('appointmentTime').value,name=$('patientName').value.trim(),phone=$('patientPhone').value.trim();
  const msg=$('bookingMessage');msg.classList.remove('success');msg.textContent='';
  if(!doctor||!(await availableSlots(doctor,date)).includes(time)){msg.textContent='Selecione um horário válido.';return;}
  const alreadyBooked=await dateBookings(doctor,date);
  if(alreadyBooked.some(b=>b.hora===time)){msg.textContent='Este horário acabou de ser reservado. Escolha outro.';await refreshTimeOptions();return;}
  if(name.length<3 || phone.replace(/\D/g,'').length<10){msg.textContent='Informe seu nome completo e um telefone válido com DDD.';return;}
  const button=$('bookButton');button.disabled=true;button.innerHTML='Registrando pedido…';
  try {
    const col=doctor.colecao, key=`${date}_${time}`;
    const record={data:date,hora:time,doctorId:doctor.id,profissional:doctor.nome,profissionalNome:doctor.nome,especialidade:doctor.especialidade,servicoNome:'Agendamento online',servicoTempoMin:30,clienteNomeCompleto:name,clienteNome:name,clienteTelefone:phone,status:'pending',createdAt:Date.now()};
    if(db) await runTransaction(db,async tx=>{const ref=doc(db,col,key);const snap=await tx.get(ref);if(snap.exists()&&snap.data()?.status!=='cancelled')throw new Error('SLOT_TAKEN');tx.set(ref,{...record,createdAt:serverTimestamp()});});
    else {const all=localGet(LOCAL_BOOKINGS_KEY,[]);if(all.some(b=>b.id===key&&b.doctorId===doctor.id&&b.status!=='cancelled'))throw new Error('SLOT_TAKEN');const retained=all.filter(b=>!(b.id===key&&b.doctorId===doctor.id));retained.push({...record,id:key,_collection:col});localSet(LOCAL_BOOKINGS_KEY,retained);}
    $('confirmationSummary').textContent=`${doctor.nome} · ${doctor.especialidade} · ${clinicDate(date)} às ${time}.`;
    $('confirmationDialog').showModal();$('bookingForm').reset();$('appointmentTime').disabled=true;$('appointmentTime').innerHTML='<option value="">Escolha uma data</option>';msg.textContent='Pedido registrado com sucesso.';msg.classList.add('success');
  } catch(e) { console.error('Falha ao reservar:',e);msg.textContent=e.message==='SLOT_TAKEN'?'Este horário acabou de ser reservado. Escolha outro.':'Não foi possível registrar seu pedido. Tente novamente.';await refreshTimeOptions(); }
  finally {button.disabled=false;button.innerHTML='Solicitar agendamento <i class="bx bx-right-arrow-alt"></i>';}
});

document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
document.querySelector('.menu-toggle').addEventListener('click',()=>{const nav=document.querySelector('.nav-links');nav.classList.toggle('active');document.querySelector('.menu-toggle i').className=nav.classList.contains('active')?'bx bx-x':'bx bx-menu';});
document.querySelectorAll('.nav-links a').forEach(a=>a.addEventListener('click',()=>document.querySelector('.nav-links').classList.remove('active')));
$('year').textContent=new Date().getFullYear();
loadDoctors();
})();

