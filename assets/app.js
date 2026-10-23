var DB=null, SEM=null;
var HARI=['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];
var HARI_PENDEK=['Sen','Sel','Rab','Kam','Jum','Sab','Min'];
var BLN=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
var BLN_PANJANG=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
var KAL={y:null,m:null};
var LBL={diskusi:'Diskusi',tugas:'Tugas',latihan:'Latihan',tuweb:'Tuweb',uas:'UAS',hadir:'Daftar hadir'};
var STATUS={belum:'Belum',draft:'Draft',submitted:'Kirim',nihil:'Tidak ada'};
var STATUS_TUWEB={belum:'Belum',draft:'Siap',submitted:'Hadir',nihil:'Tidak ada'};
var STATUS_HADIR={belum:'Belum',submitted:'Hadir',nihil:'Tidak ada'};

/* ---------- koneksi ke Apps Script ----------
 * Data tetap di Google Sheets. Halaman ini memanggil Web App Apps Script
 * lewat fetch, membawa kunci API yang disimpan di browser perangkat ini.
 */
var KUNCI_KONEKSI='tuton.api.v1', KUNCI_CACHE='tuton.cache.v1';
var API=null;
try{ API=JSON.parse(localStorage.getItem(KUNCI_KONEKSI)||'null') }catch(e){ API=null }

function galat(pesan,kode){ var e=new Error(pesan); e.kode=kode; return e }

function panggilApi(koneksi,fn,args){
  return fetch(koneksi.url,{
    method:'POST',
    // text/plain supaya browser tidak mengirim preflight CORS yang ditolak Apps Script
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({kunci:koneksi.kunci,fn:fn,args:args||[]}),
    redirect:'follow'
  }).then(function(r){ return r.text() }, function(){
    throw galat('Tidak bisa menghubungi Apps Script. Periksa koneksi internet, atau pastikan deploy Web App memakai akses "Anyone".','offline');
  }).then(function(t){
    var d;
    try{ d=JSON.parse(t) }catch(e){
      throw galat('Respons bukan dari API Tuton Tracker. Pastikan URL Web App berakhiran /exec, Code.gs sudah versi terbaru, dan deploy memakai akses "Anyone".','bukan-api');
    }
    if(!d.ok) throw galat(d.galat||'Permintaan ditolak.',d.kode);
    return d.hasil;
  });
}

function call(fn){
  var args=[].slice.call(arguments,1);
  if(!API) return Promise.reject(galat('Belum tersambung ke Apps Script.','belum'));
  return panggilApi(API,fn,args).catch(function(e){
    if(e.kode==='kunci-salah'||e.kode==='belum-ada-kunci') renderSetup(e.message);
    throw e;
  });
}
function $(s){return document.querySelector(s)}
function el(t,c,h){var e=document.createElement(t); if(c)e.className=c; if(h!==undefined)e.innerHTML=h; return e}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}

var toastTimer;
function toast(m){var t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.classList.remove('on')},2100)}

function hariIni(){return DB.hariIni}
function d(s){var p=String(s).slice(0,10).split('-');return new Date(+p[0],+p[1]-1,+p[2])}
function selisih(a,b){return Math.round((d(b)-d(a))/86400000)}
function tglPendek(s){var x=d(s);return x.getDate()+' '+BLN[x.getMonth()]}
function tglLengkap(s){var x=d(s);return HARI_PENDEK[(x.getDay()+6)%7]+', '+tglPendek(s)}
function hariKe(s){return (d(s).getDay()+6)%7}

function frasa(dl){
  var n=selisih(hariIni(),dl);
  if(n<0) return {teks:'telat '+Math.abs(n)+' hari',kelas:'hot'};
  if(n===0) return {teks:'hari ini',kelas:'hot'};
  if(n===1) return {teks:'besok',kelas:'warm'};
  if(n<=3) return {teks:n+' hari lagi',kelas:'warm'};
  return {teks:tglPendek(dl),kelas:''};
}

function matkulSem(){return DB.matkul.filter(function(m){return m.semester_id===SEM.id})}
function itemMatkul(id){return DB.item.filter(function(i){return i.matkul_id===id})}
function itemSem(){var ids=matkulSem().map(function(m){return m.id});return DB.item.filter(function(i){return ids.indexOf(i.matkul_id)>=0})}
function mkById(id){for(var i=0;i<DB.matkul.length;i++) if(DB.matkul[i].id===id) return DB.matkul[i]; return null}
function aktif(it){return it.status!=='nihil'}
function telat(it){return aktif(it) && it.status!=='submitted' && selisih(hariIni(),it.deadline)<0}
function namaItem(it){return it.label || (LBL[it.tipe]+' '+it.sesi)}

function terapkanData(json){
  DB=JSON.parse(json);
  if(!DB.semester.length){
    tampilkan('boot','<b style="display:block;color:var(--ink);font-size:16px;margin-bottom:6px">Belum ada semester</b>Jalankan <b>setupAwal()</b> di editor Apps Script, lalu muat ulang halaman ini.');
    return false;
  }
  var aktifSem=DB.semester.filter(function(s){return s.status==='aktif'})[0]||DB.semester[0];
  SEM = SEM ? (DB.semester.filter(function(s){return s.id===SEM.id})[0]||aktifSem) : aktifSem;
  tampilkan('app');
  aturLayout();
  render();
  return true;
}

function muat(){
  if(!API){ renderSetup(); return Promise.resolve(); }
  return call('getAllData').then(function(json){
    try{ localStorage.setItem(KUNCI_CACHE,json) }catch(e){}
    terapkanData(json);
  }).catch(function(e){
    if(e.kode==='kunci-salah'||e.kode==='belum-ada-kunci') return;
    if(DB){ toast(e.message); return; }
    tampilkan('boot',
      '<b style="display:block;color:var(--ink);font-size:16px;margin-bottom:6px">Gagal memuat data</b>'+esc(e.message)+
      '<div class="btn-row" style="justify-content:center;margin-top:14px">'+
        '<button class="btn" id="bootUlang">Coba lagi</button>'+
        '<button class="btn ghost" id="bootGanti">Ganti URL atau kunci</button></div>');
    $('#bootUlang').onclick=function(){ tampilkan('boot','Memuat data dari Google Sheets…'); muat(); };
    $('#bootGanti').onclick=function(){ renderSetup(); };
  });
}

function render(){renderSemPick();renderPolaOpsi();renderRadar();renderMatriks();renderJadwal();renderNilai();renderAtur();renderPengaturan()}

function renderSemPick(){
  var s=$('#semPick'); s.innerHTML='';
  DB.semester.forEach(function(x){
    var o=el('option'); o.value=x.id; o.textContent=x.label+(x.status==='aktif'?' · aktif':'');
    if(x.id===SEM.id) o.selected=true; s.appendChild(o);
  });
}

function renderPolaOpsi(){
  var sel=$('#mkPola');
  if(sel.options.length) return;
  Object.keys(DB.config.pola).forEach(function(k){
    var o=el('option'); o.value=k; o.textContent=DB.config.pola[k]; sel.appendChild(o);
  });
  sel.onchange=updatePolaHint; updatePolaHint();
}
function updatePolaHint(){
  var v=$('#mkPola').value;
  $('#polaHint').textContent = v==='berpraktik'
    ? 'Berpraktik: Perkenalan, Diskusi 1–4 di sesi 2, 3, 5, 7, latihan dan daftar hadir di tiap sesi, tiga Tugas yang tutup di sesi 4, 6, 8, dan tiga Tuweb di sesi 4, 6, 8.'
    : 'Standar: Perkenalan, lalu diskusi, latihan, dan daftar hadir di tiap sesi 1–8, plus tugas di sesi 3, 5, 7.';
}

/* ---------- radar ---------- */
function renderRadar(){
  var semua=itemSem();
  var terpakai=semua.filter(aktif);
  var belum=terpakai.filter(function(i){return i.status!=='submitted' && i.deadline});
  var lewat=[],ini=[],nanti=[];
  belum.forEach(function(i){
    var n=selisih(hariIni(),i.deadline);
    if(n<0) lewat.push(i); else if(n<=7) ini.push(i); else nanti.push(i);
  });
  var total=terpakai.length, kelar=total-belum.length;

  $('#radarSub').textContent = SEM.label+' · '+matkulSem().length+' mata kuliah'+(SEM.tgl_uas?' · UAS '+tglPendek(SEM.tgl_uas):'');

  renderTuwebBanner(belum);

  $('#strip').innerHTML =
    stat(kelar+'/'+total,'Item selesai')+
    stat(ini.length,'Jatuh tempo 7 hari')+
    stat(lewat.length,'Lewat deadline',lewat.length>0)+
    stat(total?Math.round(kelar/total*100)+'%':'0%','Progres semester');

  var wrap=$('#radarIsi'); wrap.innerHTML='';
  if(!total){
    wrap.appendChild(el('div','card empty','<b>Belum ada mata kuliah</b>Tambah matkul di menu Atur semester.'));
    return;
  }
  if(lewat.length) blok(wrap,'Lewat deadline',lewat);
  if(ini.length) blok(wrap,'Tujuh hari ke depan',ini);
  if(!lewat.length && !ini.length) wrap.appendChild(el('div','card empty','<b>Aman sampai minggu depan</b>Waktunya nyicil sesi berikutnya.'));
  if(nanti.length) blok(wrap,'Setelah itu',nanti.slice(0,10));
}

function renderTuwebBanner(belum){
  var b=$('#twBanner'); b.innerHTML='';
  var tw=belum.filter(function(i){return i.tipe==='tuweb' && selisih(hariIni(),i.deadline)>=0 && selisih(hariIni(),i.deadline)<=14})
              .sort(function(a,x){return a.deadline<x.deadline?-1:1});
  if(!tw.length) return;
  var it=tw[0], mk=mkById(it.matkul_id), w=frasa(it.deadline);
  var box=el('div','tuweb-banner');
  box.style.borderLeftColor=mk.warna;
  box.innerHTML='<span class="tuweb-when '+w.kelas+'">'+w.teks+'</span>'+
    '<span class="tuweb-body"><span class="n">'+esc(namaItem(it))+' · '+esc(mk.nama)+'</span>'+
    '<span class="m">'+tglLengkap(it.deadline)+' pukul '+esc(it.jam||'belum diisi')+
    (tw.length>1?' · '+(tw.length-1)+' Tuweb lain menyusul':'')+'</span></span>';
  var act=el('span','tuweb-act');
  if(it.link){
    var a=el('a','btn small','Buka ruang'); a.href=it.link; a.target='_blank'; a.rel='noopener';
    a.style.background='var(--ink)'; a.style.color='#fff'; a.style.textDecoration='none';
    act.appendChild(a);
  }
  var set=el('button','btn ghost small','Atur tanggal');
  set.onclick=function(){pindahView('jadwal')};
  act.appendChild(set);
  box.appendChild(act);
  b.appendChild(box);
}

function stat(n,l,warn){return '<div class="stat'+(warn?' warn':'')+'"><div class="num">'+n+'</div><div class="lbl">'+l+'</div></div>'}

function blok(wrap,judul,arr){
  wrap.appendChild(el('div','group-label','<span>'+judul+'</span>'));
  var list=el('div','due-list');
  arr.sort(function(a,b){return a.deadline<b.deadline?-1:1}).forEach(function(it){
    var mk=mkById(it.matkul_id); if(!mk) return;
    var w=frasa(it.deadline);
    var row=el('button','due-row');
    row.innerHTML='<span class="due-tick '+esc(it.status)+'">'+(it.status==='submitted'?'<svg viewBox="0 0 12 12"><polyline points="2,6.5 4.8,9 10,3"/></svg>':'')+'</span>'+
      '<span class="due-body"><span class="due-title">'+esc(namaItem(it))+(it.tipe==='tuweb'&&it.jam?' · '+esc(it.jam):'')+'</span>'+
      '<span class="due-sub"><i style="width:7px;height:7px;border-radius:2px;background:'+esc(mk.warna)+';display:inline-block"></i>'+esc(mk.nama)+'</span></span>'+
      '<span class="due-when '+w.kelas+'">'+w.teks+'</span>';
    row.onclick=function(){bukaDrawer(mk.id,Number(it.sesi))};
    list.appendChild(row);
  });
  wrap.appendChild(list);
}

/* ---------- matriks ---------- */
function renderMatriks(){
  var mks=matkulSem(), wrap=$('#matrixWrap');
  if(!mks.length){wrap.innerHTML='<div class="empty"><b>Matriks masih kosong</b>Tambah mata kuliah dulu.</div>';return}
  var h='<table class="matrix"><thead><tr><th class="mk-head">Mata kuliah</th>';
  for(var s=1;s<=8;s++) h+='<th>Sesi '+s+'</th>';
  h+='</tr></thead><tbody>';

  mks.forEach(function(mk){
    var its=itemMatkul(mk.id);
    var dipakai=its.filter(aktif);
    var sel=dipakai.filter(function(i){return i.status==='submitted'}).length;
    var pct=dipakai.length?Math.round(sel/dipakai.length*100):0;
    var namaPola=DB.config.pola[mk.pola]||'';
    h+='<tr><th class="mk-cell"><span class="mk-name"><i class="mk-stripe" style="background:'+esc(mk.warna)+'"></i>'+esc(mk.nama)+'</span>'+
       '<span class="mk-meta">'+esc(mk.kode||'')+(mk.kode?' · ':'')+mk.sks+' sks · '+pct+'% · '+esc(namaPola)+'</span></th>';
    for(var s=1;s<=8;s++){
      var sesi=its.filter(function(i){return Number(i.sesi)===s});
      var ada=sesi.some(function(i){return telat(i)});
      h+='<td class="cell'+(ada?' due':'')+'"><button data-mk="'+mk.id+'" data-s="'+s+'" aria-label="Sesi '+s+' '+esc(mk.nama)+'">';
      ['hadir','diskusi','latihan','tugas','tuweb'].forEach(function(t){
        sesi.filter(function(i){return i.tipe===t}).forEach(function(it){
          var extra = t==='tugas'?'tugas ':(t==='tuweb'?'tuweb ':(t==='hadir'?'hadir ':''));
          var st = it.status==='nihil' ? 'nihil' : (it.status!=='belum' ? it.status : (telat(it)?'telat':''));
          h+='<i class="pip '+extra+st+'" title="'+esc(namaItem(it))+'"></i>';
        });
      });
      h+='</button></td>';
    }
    h+='</tr>';
  });
  wrap.innerHTML=h+'</tbody></table>';
  wrap.querySelectorAll('.cell button').forEach(function(b){
    b.onclick=function(){bukaDrawer(b.dataset.mk,Number(b.dataset.s))};
  });
}

/* ---------- drawer ---------- */
function bukaDrawer(mkId,sesi){
  var mk=mkById(mkId);
  var its=itemMatkul(mkId).filter(function(i){return Number(i.sesi)===sesi});
  var dr=$('#drawer');
  var h='<div class="drawer-head"><h3>Sesi '+sesi+'</h3><button class="btn ghost small" id="drTutup">Tutup</button></div>'+
    '<p class="drawer-sub">'+esc(mk.nama)+(mk.link_tuton?' · <a href="'+esc(mk.link_tuton)+'" target="_blank" rel="noopener">buka ruang Tuton</a>':'')+'</p>';

  if(!its.length) h+='<p style="color:var(--ink3);font-size:14px">Sesi ini tidak punya diskusi, tugas, maupun Tuweb.</p>';

  its.forEach(function(it){
    var tw = it.tipe==='tuweb';
    var hd = it.tipe==='hadir';
    var st = hd?STATUS_HADIR:(tw?STATUS_TUWEB:STATUS);

    if(hd){
      h+='<div class="task" data-id="'+it.id+'" data-tipe="hadir">'+
        '<div class="task-top" style="margin:0"><span class="nm">Daftar hadir</span><span class="cycler">'+
        ['belum','submitted','nihil'].map(function(s2){
          return '<button data-st="'+s2+'" class="'+(it.status===s2?'on':'')+'">'+st[s2]+'</button>';
        }).join('')+'</span></div></div>';
      return;
    }

    h+='<div class="task'+(tw?' is-tuweb':'')+'" data-id="'+it.id+'" data-tipe="'+it.tipe+'">'+
      '<div class="task-top"><span class="nm">'+esc(namaItem(it))+'</span><span class="cycler">'+
      ['belum','draft','submitted','nihil'].map(function(s){
        return '<button data-st="'+s+'" class="'+(it.status===s?'on':'')+'">'+st[s]+'</button>';
      }).join('')+'</span></div>'+
      '<div class="row2">'+
      '<div class="field"><label>'+(tw?'Tanggal':'Deadline')+'</label><input type="date" data-f="deadline" value="'+esc(it.deadline)+'"></div>'+
      (tw
        ? '<div class="field"><label>Jam mulai</label><input type="time" data-f="jam" value="'+esc(it.jam||'19:00')+'"></div>'
        : '<div class="field"><label>Nilai</label><input type="number" data-f="nilai" min="0" max="100" value="'+esc(it.nilai)+'" placeholder="—"></div>')+
      '</div>'+
      '<div class="field"><label>'+(tw?'Link ruang Tuweb':'Link jawaban')+'</label><input type="url" data-f="link" value="'+esc(it.link)+'" placeholder="'+(tw?'Zoom, Teams, atau MS Teams UT':'Google Docs, Drive, dll')+'"></div>'+
      '<div class="field"><label>Catatan</label><textarea data-f="catatan" placeholder="'+(tw?'Nama tutor, materi yang dibahas, tugas dadakan':'Poin yang mau ditulis, referensi modul')+'">'+esc(it.catatan)+'</textarea></div>'+
      (it.tipe!=='tuweb' && it.tipe!=='uas' && it.tipe!=='hadir'
        ? '<button class="btn ghost small prompt-btn" style="width:100%">'+labelTombolPrompt(it)+'</button>' : '')+
      '</div>';
  });

  dr.innerHTML=h;
  dr.setAttribute('aria-hidden','false');
  dr.classList.add('on'); $('#scrim').classList.add('on');
  $('#drTutup').onclick=tutupDrawer;

  dr.querySelectorAll('.task').forEach(function(box){
    var id=box.dataset.id;
    box.querySelectorAll('.cycler button').forEach(function(b){
      b.onclick=function(){
        box.querySelectorAll('.cycler button').forEach(function(x){x.classList.remove('on')});
        b.classList.add('on'); simpanItem(id,{status:b.dataset.st});
      };
    });
    box.querySelectorAll('[data-f]').forEach(function(inp){
      inp.onchange=function(){var p={};p[inp.dataset.f]=inp.value;simpanItem(id,p)};
    });
    var pb=box.querySelector('.prompt-btn');
    if(pb) pb.onclick=function(){bukaPrompt(box,id,mk)};
    var itData=DB.item.filter(function(x){return x.id===id})[0];
    if(itData) box.appendChild(kontrolKalender(itData,true));
  });
}

/* ---------- prompt asisten ---------- */
function bukaPrompt(box,itemId,mk){
  var lama=box.querySelector('.prompt-wrap');
  if(lama){lama.remove();return}
  var it=DB.item.filter(function(x){return x.id===itemId})[0];
  var w=el('div','prompt-wrap');
  var ta=el('textarea'); ta.value=buatPrompt(it,mk); ta.spellcheck=false;
  w.appendChild(ta);
  var act=el('div','prompt-act');
  var salin=el('button','btn small','Salin prompt');
  var info=el('span',null,bantuanPrompt(it));
  salin.onclick=function(){
    salinTeks(ta);
    salin.textContent='Tersalin'; setTimeout(function(){salin.textContent='Salin prompt'},1600);
  };
  act.appendChild(salin); act.appendChild(info);
  w.appendChild(act);
  box.appendChild(w);
  ta.scrollIntoView({block:'nearest'});
}

function salinTeks(ta){
  ta.focus(); ta.select();
  try{ ta.setSelectionRange(0,ta.value.length) }catch(e){}
  var ok=false;
  try{ ok=document.execCommand('copy') }catch(e){}
  if(!ok && navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(function(){});
}

function labelTombolPrompt(it){
  if(it.tipe==='latihan') return 'Prompt bahas latihan';
  if(it.tipe==='tugas') return 'Prompt kerjakan tugas';
  if(/perkenal/i.test(it.label||'')) return 'Prompt tulis perkenalan';
  return 'Prompt jawab diskusi';
}

function bantuanPrompt(it){
  if(it.tipe==='latihan') return 'Tempel soal beserta pilihan jawabannya, lalu tulis tebakan lu sendiri dulu.';
  if(/perkenal/i.test(it.label||'')) return 'Isi dulu bagian "Tentang saya", baru tempel instruksi tutornya.';
  return 'Tempel ke Claude, lalu tempel soal tutornya di bagian yang ditandai.';
}

function konteksPrompt(it,mk,jenis){
  var b=[];
  b.push('## Konteks');
  b.push('- Mata kuliah: '+mk.nama+(mk.kode?' ('+mk.kode+')':''));
  b.push('- Program studi: Sistem Informasi, Universitas Terbuka');
  b.push('- Jenis: '+jenis+' · '+namaItem(it)+' · sesi '+it.sesi);
  if(it.deadline) b.push('- Batas akhir: '+tglLengkap(it.deadline));
  var p=(mk.profil||'').trim();
  if(p) b.push('- Karakter mata kuliah ini: '+p);
  return b.join('\n');
}

function aturanReferensi(mk){
  var kode = mk.kode || 'mata kuliah ini';
  return [
    '## Referensi',
    'Cantumkan di bagian terpisah setelah jawaban.',
    '- Utamakan Buku Materi Pokok (BMP) Universitas Terbuka. Boleh ditambah buku, jurnal, atau sumber terpercaya lain kalau perlu.',
    '- Format: Nama Penulis. (Tahun). Judul. Penerbit/Sumber.',
    '- Kalau kamu tidak yakin nomor modul atau halaman BMP-nya, tulis "perlu dicek di BMP ' + kode + ' modul terkait". Jangan mengarang nomor.',
    '- Klaim yang tidak bisa kamu sumberkan, tandai "[belum tersumber]" dan sebutkan alasannya. Jangan disamarkan jadi kalimat yang terdengar meyakinkan.',
    '- Jangan mengarang angka statistik, nomor pasal, atau kutipan langsung.'
  ].join('\n');
}

function gayaDasar(){
  return [
    '- Pakai bahasa yang mudah dipahami orang awam. Kalau terpaksa memakai istilah ilmiah, jelaskan artinya langsung di kalimat yang sama.',
    '- Padat dan langsung ke inti. Jangan bertele-tele.',
    '- Tulis dalam paragraf mengalir, bukan daftar poin.',
    '- Tanpa basa-basi pembuka seperti "Izin menjawab" atau "Menurut pendapat saya".'
  ].join('\n');
}

function blokCatatan(it,kosong){
  return ['## Yang sudah saya punya','"""',
    (it.catatan||'').trim() || kosong, '"""'].join('\n');
}

function buatPrompt(it,mk){
  if(it.tipe==='latihan') return promptLatihan(it,mk);
  if(it.tipe==='tugas') return promptTugas(it,mk);
  if(/perkenal/i.test(it.label||'')) return promptPerkenalan(it,mk);
  return promptDiskusi(it,mk);
}

/* --- sesi 1: perkenalan --- */
function promptPerkenalan(it,mk){
  return [
    'Kamu asisten yang membantu mahasiswa Universitas Terbuka menulis perkenalan diri di forum Tuton. Ini bukan tugas akademik, jadi tidak perlu referensi, teori, atau sitasi apa pun.',
    '',
    konteksPrompt(it,mk,'Perkenalan'),
    '',
    '## Instruksi dari tutor',
    '"""',
    '[TEMPEL INSTRUKSI PERKENALAN DARI TUTOR — biasanya menyebut hal apa saja yang wajib ada]',
    '"""',
    '',
    '## Tentang saya',
    '"""',
    'Nama: ',
    'NIM: ',
    'UPBJJ / domisili: ',
    'Pekerjaan atau kesibukan sekarang: ',
    'Alasan mengambil prodi ini: ',
    'Harapan dari mata kuliah ini: ',
    '"""',
    '',
    '## Cara menulis',
    '- Ikuti persis apa yang diminta tutor. Kalau tutor menyebut daftar hal yang wajib ada, pastikan semuanya tercakup.',
    '- Satu sampai dua paragraf pendek, sekitar 100-150 kata. Perkenalan yang kepanjangan jarang dibaca.',
    '- Nada ramah dan wajar. Hindari kalimat klise seperti "semoga kita bisa saling berbagi ilmu" atau pujian berlebihan ke tutor.',
    '- Kalau ada kaitan antara pekerjaan saya dan mata kuliah ini, sebut sekilas. Itu bikin perkenalan saya punya isi, bukan sekadar formalitas.',
    '',
    '## Kalau data saya kurang',
    'Tanya balik dulu. Jangan mengarang asal daerah, pekerjaan, atau alasan yang tidak saya sebutkan.'
  ].join('\n');
}

/* --- diskusi biasa --- */
function promptDiskusi(it,mk){
  return [
    'Kamu asisten akademik yang membantu mahasiswa Universitas Terbuka menjawab pertanyaan diskusi Tuton.',
    '',
    konteksPrompt(it,mk,'Diskusi Tuton'),
    '',
    '## Pertanyaan diskusi',
    '"""',
    '[TEMPEL PERTANYAAN DARI TUTOR DI SINI — termasuk bacaan pengantar kalau ada]',
    '"""',
    '',
    blokCatatan(it,'[kosongkan kalau belum punya bahan, atau tulis poin yang sudah kepikiran]'),
    '',
    '## Cara menjawab',
    gayaDasar(),
    '- Maksimal 3-4 paragraf pendek.',
    '- Kalau pertanyaannya punya beberapa bagian, pastikan semuanya terjawab tanpa menambah panjang berlebihan.',
    '',
    aturanReferensi(mk),
    '',
    '## Penutup',
    'Setelah daftar referensi, tulis dua pertanyaan singkat yang mungkin diajukan tutor sebagai tanggapan, beserta arah jawabannya. Bagian ini di luar hitungan 3-4 paragraf.',
    '',
    '## Kalau pertanyaannya kurang jelas',
    'Tanya balik dulu sebelum menjawab. Jangan menebak konteks yang tidak ada di soal.'
  ].join('\n');
}

/* --- tugas tutorial --- */
function promptTugas(it,mk){
  return [
    'Kamu asisten akademik yang membantu mahasiswa Universitas Terbuka mengerjakan Tugas Tutorial. Bobotnya besar terhadap nilai Tuton dan dikumpulkan sebagai berkas, jadi hasilnya harus rapi dan bisa saya pertanggungjawabkan sendiri.',
    '',
    konteksPrompt(it,mk,'Tugas Tutorial'),
    '',
    '## Soal tugas',
    '"""',
    '[TEMPEL SOAL LENGKAP — kalau bernomor, tempel semua nomornya]',
    '"""',
    '',
    blokCatatan(it,'[tulis poin yang sudah kepikiran, atau kosongkan]'),
    '',
    '## Cara mengerjakan',
    '1. Tunjukkan kerangka singkat dulu sebelum menulis: tiap nomor ditanya apa, dan materi modul mana yang relevan. Saya mau menilai arahnya sebelum kamu menulis panjang.',
    '2. Setelah saya setuju, baru tulis jawabannya per nomor sesuai urutan soal.',
    '3. Tiap nomor: langsung jawab pertanyaannya di kalimat pertama, baru uraikan. Cukup 2-4 paragraf pendek per nomor.',
    '4. Kalau ada perhitungan, tabel, kode, atau diagram, tampilkan lengkap. Jangan lompat ke hasil akhir.',
    '5. Tutup dengan checklist singkat: hal apa yang harus saya periksa sendiri sebelum mengumpulkan.',
    '',
    '## Gaya tulisan',
    gayaDasar(),
    '- Boleh pakai subjudul per nomor soal supaya pemeriksa gampang menelusuri.',
    '',
    aturanReferensi(mk),
    '',
    '## Orisinalitas',
    '- Tugas ini dicek kemiripannya. Jangan menyalin utuh kalimat dari mana pun, termasuk dari modul.',
    '- Kalau perlu mengutip langsung, batasi satu sampai dua kalimat, beri tanda kutip, dan sebutkan sumbernya.',
    '- Sisanya parafrase dengan struktur kalimat yang benar-benar berbeda dari aslinya.',
    '',
    '## Kalau soalnya kurang jelas',
    'Tanya balik dulu. Untuk tugas bernilai besar, salah menafsirkan soal lebih mahal daripada telat bertanya.'
  ].join('\n');
}

/* --- latihan / quiz --- */
function promptLatihan(it,mk){
  var kode = mk.kode || 'mata kuliah ini';
  return [
    'Kamu asisten akademik yang membantu mahasiswa Universitas Terbuka memahami soal latihan Tuton. Tujuan saya paham materinya, bukan sekadar dapat jawaban benar.',
    '',
    konteksPrompt(it,mk,'Latihan / quiz'),
    '',
    '## Soal',
    '"""',
    '[TEMPEL SOAL BESERTA SELURUH PILIHAN JAWABANNYA]',
    '"""',
    '',
    '## Jawaban saya dan alasannya',
    '"""',
    '[TULIS PILIHAN SAYA DAN KENAPA SAYA PILIH ITU — kalau belum tahu, tulis "belum tahu"]',
    '"""',
    '',
    '## Cara membahas',
    '1. Kalau saya sudah menjawab, nilai dulu alasan saya, bukan cuma pilihannya. Jawaban benar dengan alasan keliru tetap masalah, dan sebutkan itu kalau terjadi.',
    '2. Sebutkan jawaban yang tepat beserta konsep yang mendasarinya.',
    '3. Bahas pilihan yang salah satu per satu: kenapa masing-masing terlihat masuk akal tapi keliru. Bagian ini yang paling berguna untuk saya waktu UAS.',
    '4. Sebutkan materi modul mana yang perlu saya baca ulang kalau saya salah.',
    '5. Kalau saya menulis "belum tahu", jangan langsung beri jawabannya. Beri satu petunjuk arah dulu dan minta saya mencoba lagi.',
    '',
    '## Gaya',
    gayaDasar(),
    '- Maksimal 200 kata per soal.',
    '',
    '## Aturan',
    '- Kalau kamu tidak yakin nomor modul BMP-nya, tulis "perlu dicek di BMP ' + kode + '". Jangan mengarang.',
    '- Kalau soalnya punya lebih dari satu tafsir atau pilihan jawabannya ambigu, katakan terus terang.'
  ].join('\n');
}

function tutupDrawer(){
  $('#drawer').classList.remove('on');
  $('#drawer').setAttribute('aria-hidden','true');
  $('#scrim').classList.remove('on');
}

function simpanItem(id,patch){
  for(var i=0;i<DB.item.length;i++) if(DB.item[i].id===id){for(var k in patch) DB.item[i][k]=patch[k];break}
  renderRadar();renderMatriks();renderNilai();renderTuwebList();renderUasList();renderKalender();
  call('ubahItem',id,patch).then(function(){toast('Tersimpan')}).catch(function(){toast('Gagal menyimpan, coba lagi')});
}

/* ---------- jadwal + tuweb ---------- */
/* ---------- kontrol Google Calendar per item ---------- */
function kontrolKalender(it,inline){
  var wrap=el('span','tw-sync'+(inline?' kal-inline':''));
  var sibuk=false;

  function pesanGagal(e){
    var t=String(e && (e.message||e));
    if(/authoriz|permission|izin|scope/i.test(t))
      toast('Calendar belum diizinkan. Jalankan cekKalender() di editor.');
    else toast('Gagal menghubungi Calendar');
  }

  function gambar(){
    wrap.className='tw-sync'+(inline?' kal-inline':'')+(it.kal_id?' on':'');
    wrap.innerHTML='';
    if(sibuk){ wrap.appendChild(el('span',null,'Memproses…')); return }

    if(it.kal_id){
      wrap.appendChild(el('i'));
      wrap.appendChild(el('span',null,'Di Google Calendar'));
      var hapus=el('button','lepas','hapus dari kalender');
      hapus.onclick=function(){
        if(!confirm('Hapus event "'+namaItem(it)+'" dari Google Calendar?\n\nData di dashboard tetap aman, cuma event kalendernya yang dihapus.')) return;
        sibuk=true; gambar();
        call('lepasKalender',it.id).then(function(){
          setLokal(it.id,{kal_id:''}); sibuk=false; gambar(); toast('Event dihapus dari Calendar');
        }).catch(function(e){ sibuk=false; gambar(); pesanGagal(e) });
      };
      wrap.appendChild(hapus);
    } else {
      var tambah=el('button','btn ghost small','Tambah ke Google Calendar');
      tambah.onclick=function(){
        sibuk=true; gambar();
        call('sinkronItemTunggal',it.id).then(function(json){
          var h=JSON.parse(json);
          setLokal(it.id,{kal_id:h.kal_id});
          sibuk=false; gambar();
          toast(h.aksi==='buat' ? 'Masuk ke kalender "'+h.kalender+'"' : 'Event diperbarui');
        }).catch(function(e){ sibuk=false; gambar(); pesanGagal(e) });
      };
      wrap.appendChild(tambah);
    }
  }

  function setLokal(id,patch){
    for(var i=0;i<DB.item.length;i++) if(DB.item[i].id===id){
      for(var k in patch){ DB.item[i][k]=patch[k]; it[k]=patch[k]; }
      break;
    }
  }

  gambar();
  return wrap;
}

function renderJadwal(){renderKalender();renderTuwebList();renderUasList();renderSlotMingguan()}

function renderUasList(){
  var wrap=$('#uasList'); if(!wrap) return;
  wrap.innerHTML='';
  var uas=itemSem().filter(function(i){return i.tipe==='uas'})
    .sort(function(a,b){
      if(a.deadline!==b.deadline) return (a.deadline||'9999')<(b.deadline||'9999')?-1:1;
      return 0;
    });
  if(!uas.length){
    wrap.innerHTML='<p style="color:var(--ink3);font-size:14px">Belum ada mata kuliah di semester ini.</p>';
    return;
  }
  uas.forEach(function(it){
    var mk=mkById(it.matkul_id); if(!mk) return;
    var row=el('div','tw-row');
    var ket = it.status==='nihil' ? 'tidak ada'
      : (!it.deadline ? 'tanggal belum diisi'
      : (it.status==='submitted' ? 'sudah dikerjakan' : frasa(it.deadline).teks));
    row.innerHTML='<span class="tw-id"><span class="n"><i class="mk-stripe" style="background:'+esc(mk.warna)+'"></i>'+esc(mk.nama)+'</span>'+
      '<span class="m">'+esc(mk.kode||'UAS')+' · '+ket+'</span></span>';
    var inb=el('span','tw-in');
    inb.innerHTML='<input type="date" data-f="deadline" value="'+esc(it.deadline)+'">'+
      '<input type="time" data-f="jam" value="'+esc(it.jam)+'" title="Jam mulai ujian">'+
      '<input type="text" data-f="catatan" value="'+esc(it.catatan)+'" placeholder="Ruang, sesi ujian, catatan">';
    inb.querySelectorAll('[data-f]').forEach(function(inp){
      inp.onchange=function(){var p={};p[inp.dataset.f]=inp.value;simpanItem(it.id,p)};
    });
    row.appendChild(inb);
    row.appendChild(kontrolKalender(it));
    wrap.appendChild(row);
  });
}

function pad2(n){return (n<10?'0':'')+n}
function kunciTgl(y,m,hari){return y+'-'+pad2(m+1)+'-'+pad2(hari)}

/** Bulan awal: bulan Tuweb terdekat yang belum lewat, kalau tidak ada pakai bulan ini. */
function initKal(){
  if(KAL.y!==null) return;
  var tw=itemSem().filter(function(i){return i.tipe==='tuweb' && i.deadline && selisih(hariIni(),i.deadline)>=0})
    .sort(function(a,b){return a.deadline<b.deadline?-1:1});
  var base = tw.length ? d(tw[0].deadline) : d(hariIni());
  KAL.y=base.getFullYear(); KAL.m=base.getMonth();
}

function geserBulan(n){
  initKal();
  var x=new Date(KAL.y,KAL.m+n,1);
  KAL.y=x.getFullYear(); KAL.m=x.getMonth();
  renderKalender();
}

function renderKalender(){
  var g=$('#kalGrid'); if(!g) return;
  initKal();
  $('#kalBln').textContent=BLN_PANJANG[KAL.m]+' '+KAL.y;

  var peta={};
  itemSem().forEach(function(it){ if(!it.deadline || !aktif(it)) return; (peta[it.deadline]=peta[it.deadline]||[]).push(it); });

  var offset=(new Date(KAL.y,KAL.m,1).getDay()+6)%7;
  var jumlah=new Date(KAL.y,KAL.m+1,0).getDate();
  var sblm=new Date(KAL.y,KAL.m,0).getDate();

  g.innerHTML='';
  HARI_PENDEK.forEach(function(h){ g.appendChild(el('div','kal-dow',h)); });

  for(var i=0;i<offset;i++) g.appendChild(el('div','kal-cell luar','<div class="kal-num" style="opacity:.35">'+(sblm-offset+i+1)+'</div>'));

  for(var hari=1;hari<=jumlah;hari++){
    var kunci=kunciTgl(KAL.y,KAL.m,hari);
    var cell=el('div','kal-cell'+(kunci===hariIni()?' today':'')+(kunci===SEM.tgl_uas?' uas':''));
    cell.appendChild(el('div','kal-num',String(hari)));

    var isi=peta[kunci]||[];
    isi.filter(function(i){return i.tipe==='tuweb'}).forEach(function(it){
      var mk=mkById(it.matkul_id); if(!mk) return;
      var chip=el('button','kal-chip'+(it.status==='submitted'?' hadir':''),esc(namaItem(it)));
      chip.style.background=mk.warna;
      chip.title=namaItem(it)+' · '+mk.nama+' · '+(it.jam||'jam belum diisi');
      chip.onclick=function(){bukaDrawer(mk.id,Number(it.sesi))};
      cell.appendChild(chip);
    });

    var uas=isi.filter(function(i){return i.tipe==='uas'});
    if(uas.length){
      var nm=uas.length===1 ? (mkById(uas[0].matkul_id)||{}).nama : uas.length+' mata kuliah';
      var cu=el('button','kal-chip kal-uas-chip','UAS · '+esc(nm));
      cu.title='UAS: '+uas.map(function(u){
        var m=mkById(u.matkul_id);
        return (m?m.nama:'') + (u.jam?' '+u.jam:'');
      }).join(', ');
      cu.onclick=function(){
        var t=$('#uasList'); if(t) t.scrollIntoView({block:'center'});
      };
      cell.appendChild(cu);
    }

    var lain=isi.filter(function(i){return i.tipe!=='tuweb' && i.tipe!=='uas'});
    if(lain.length){
      var sudah={},dots=el('div','kal-dots');
      lain.forEach(function(it){
        if(sudah[it.matkul_id]) return;
        sudah[it.matkul_id]=1;
        var mk=mkById(it.matkul_id); if(!mk) return;
        var dot=el('i','kal-dot');
        dot.style.background = it.status==='submitted' ? 'var(--rule)' : mk.warna;
        dot.title=mk.nama;
        dots.appendChild(dot);
      });
      cell.appendChild(dots);
    }

    if(kunci===SEM.tgl_uas) cell.appendChild(el('div','kal-uas','UAS'));
    g.appendChild(cell);
  }

  var sisa=(7-((offset+jumlah)%7))%7;
  for(var j=1;j<=sisa;j++) g.appendChild(el('div','kal-cell luar','<div class="kal-num" style="opacity:.35">'+j+'</div>'));
}

function renderTuwebList(){
  var wrap=$('#twList'); if(!wrap) return;
  wrap.innerHTML='';
  var tw=itemSem().filter(function(i){return i.tipe==='tuweb'})
    .sort(function(a,b){return a.deadline<b.deadline?-1:1});
  if(!tw.length){
    wrap.innerHTML='<p style="color:var(--ink3);font-size:14px">Belum ada Tuweb. Tuweb muncul otomatis kalau mata kuliahnya pakai pola berpraktik.</p>';
    return;
  }
  tw.forEach(function(it){
    var mk=mkById(it.matkul_id);
    var row=el('div','tw-row');
    var w=frasa(it.deadline);
    row.innerHTML='<span class="tw-id"><span class="n"><i class="mk-stripe" style="background:'+esc(mk.warna)+'"></i>'+esc(namaItem(it))+' · '+esc(mk.nama)+'</span>'+
      '<span class="m">Sesi '+it.sesi+' · '+(it.status==='submitted'?'sudah hadir':w.teks)+'</span></span>';
    var inb=el('span','tw-in');
    inb.innerHTML='<input type="date" data-f="deadline" value="'+esc(it.deadline)+'">'+
      '<input type="time" data-f="jam" value="'+esc(it.jam||'19:00')+'">'+
      '<input type="url" data-f="link" value="'+esc(it.link)+'" placeholder="Link ruang Tuweb">';
    inb.querySelectorAll('[data-f]').forEach(function(inp){
      inp.onchange=function(){var p={};p[inp.dataset.f]=inp.value;simpanItem(it.id,p)};
    });
    row.appendChild(inb);
    row.appendChild(kontrolKalender(it));
    wrap.appendChild(row);
  });
}

function renderSlotMingguan(){
  var mks=matkulSem();
  var sel=$('#jdMk'); sel.innerHTML='';
  mks.forEach(function(m){var o=el('option');o.value=m.id;o.textContent=m.nama;sel.appendChild(o)});
  var sh=$('#jdHari');
  if(!sh.options.length) HARI.forEach(function(h,i){var o=el('option');o.value=i;o.textContent=h;sh.appendChild(o)});

  var ids=mks.map(function(m){return m.id});
  var jd=DB.jadwal.filter(function(j){return ids.indexOf(j.matkul_id)>=0});
  var today=hariKe(hariIni());

  var w=$('#week'); w.innerHTML=''; w.removeAttribute('data-kosong');
  var adaIsi=false;
  HARI.forEach(function(nama,i){
    var isi=jd.filter(function(j){return Number(j.hari)===i}).sort(function(a,b){return a.jam_mulai<b.jam_mulai?-1:1});
    if(isi.length) adaIsi=true;
    var box=el('div','day'+(i===today?' today':'')+(isi.length?'':' kosong'));
    box.appendChild(el('h3',null,nama+(i===today?' · hari ini':'')));
    if(!isi.length) box.appendChild(el('p',null,'<span style="font-size:12.5px;color:var(--ink3)">—</span>'));
    isi.forEach(function(j){
      var mk=mkById(j.matkul_id); if(!mk) return;
      var s=el('div','slot'); s.style.borderLeftColor=mk.warna;
      s.innerHTML='<div class="t">'+esc(j.jam_mulai)+'–'+esc(j.jam_selesai)+'</div><div class="n">'+esc(mk.nama)+'</div>'+
        '<div class="k"><span class="tag">'+esc(j.tipe)+'</span>'+(j.keterangan?' '+esc(j.keterangan):'')+'</div>';
      var del=el('button',null,'Hapus');
      del.onclick=function(){
        DB.jadwal=DB.jadwal.filter(function(x){return x.id!==j.id});
        renderSlotMingguan(); call('hapusJadwal',j.id).then(function(){toast('Slot dihapus')});
      };
      s.appendChild(del); box.appendChild(s);
    });
    w.appendChild(box);
  });
  if(!adaIsi) w.setAttribute('data-kosong','1');
}

/* ---------- nilai ---------- */
function hitungTuton(its){
  var b=DB.config.bobotTuton, rincian={};

  // Tugas dan diskusi: rata-rata nilai yang sudah keluar
  ['tugas','diskusi'].forEach(function(t){
    if(!b[t]) return;
    var n=its.filter(function(i){return i.tipe===t && aktif(i) && i.nilai!=='' && i.nilai!=null});
    if(n.length) rincian[t]=n.reduce(function(a,i){return a+Number(i.nilai)},0)/n.length;
  });

  // Kehadiran: hanya sesi yang sudah lewat atau sudah ditandai hadir.
  // Sesi yang belum terjadi tidak dianggap bolos.
  if(b.hadir){
    var relevan=its.filter(function(i){
      return i.tipe==='hadir' && aktif(i) &&
        (i.status==='submitted' || (i.deadline && selisih(hariIni(),i.deadline)<0));
    });
    if(relevan.length){
      var hadir=relevan.filter(function(i){return i.status==='submitted'}).length;
      rincian.hadir=hadir/relevan.length*100;
      rincian.hadirDari=relevan.length;
    }
  }

  // Nilai Tuton baru ditampilkan kalau ada nilai tugas atau diskusi.
  // Kehadiran sendirian tidak cukup buat memperkirakan nilai Tuton.
  if(rincian.tugas==null && rincian.diskusi==null) return {nilai:0, ada:false, rincian:rincian};

  var skor=0, total=0;
  ['tugas','diskusi','hadir'].forEach(function(k){
    if(rincian[k]!=null && b[k]){ skor+=rincian[k]*b[k]; total+=b[k]; }
  });
  return {nilai:skor/total, ada:true, rincian:rincian};
}

function renderNilai(){
  var mks=matkulSem(),wrap=$('#nilaiIsi');
  if(!mks.length){wrap.innerHTML='<div class="empty"><b>Belum ada yang dihitung</b>Tambah mata kuliah dan isi nilai yang sudah keluar.</div>';return}
  var ba=DB.config.bobotAkhir,amb=DB.config.ambang;
  wrap.innerHTML='';
  mks.forEach(function(mk){
    var its=itemMatkul(mk.id);
    var t=hitungTuton(its);
    var dipakai=its.filter(aktif);
    var sel=dipakai.filter(function(i){return i.status==='submitted'}).length;
    var pct=dipakai.length?Math.round(sel/dipakai.length*100):0;
    var uas=(mk.nilai_uas!==''&&mk.nilai_uas!=null)?Number(mk.nilai_uas):null;
    var kanan;
    if(uas!==null){
      var na=t.nilai*ba.tuton+uas*ba.uas, huruf='D';
      ['A','B+','B','C+','C'].some(function(h){if(na>=amb[h]){huruf=h;return true}return false});
      kanan='<div class="target">Nilai akhir <b>'+na.toFixed(1)+'</b> · huruf mutu <b>'+huruf+'</b></div>';
    } else if(t.ada){
      var perlu=[];
      ['A','B'].forEach(function(h){
        var u=(amb[h]-t.nilai*ba.tuton)/ba.uas;
        perlu.push(h+' butuh UAS <b>'+(u<=0?'nilai berapa pun':(u>100?'nggak terkejar':u.toFixed(1)))+'</b>');
      });
      kanan='<div class="target">'+perlu.join(' · ')+'</div>';
    } else {
      kanan='<div class="target" style="color:var(--ink3)">Isi nilai diskusi atau tugas dulu buat lihat perkiraan.</div>';
    }
    var box=el('div','grade');
    box.innerHTML='<div class="grade-id"><div class="mk-name"><i class="mk-stripe" style="background:'+esc(mk.warna)+'"></i>'+esc(mk.nama)+'</div>'+
      '<div class="mk-meta">'+esc(mk.kode||'')+(mk.kode?' · ':'')+mk.sks+' sks</div>'+
      '<div class="bar"><i style="width:'+pct+'%"></i></div>'+kanan+'</div>'+
      '<div class="grade-nums"><div class="gn"><div class="v">'+(t.ada?t.nilai.toFixed(1):'—')+'</div><div class="l">Nilai Tuton</div></div>'+
      '<div class="gn"><div class="v">'+(t.rincian.hadir!=null?Math.round(t.rincian.hadir)+'%':'—')+'</div><div class="l">Kehadiran'+(t.rincian.hadirDari?' · '+t.rincian.hadirDari+' sesi':'')+'</div></div>'+
      '<div class="gn"><input type="number" min="0" max="100" placeholder="—" value="'+(uas!==null?uas:'')+'" data-mk="'+mk.id+'"><div class="l">Nilai UAS</div></div></div>';
    wrap.appendChild(box);
  });
  wrap.querySelectorAll('input[data-mk]').forEach(function(inp){
    inp.onchange=function(){
      var id=inp.dataset.mk,v=inp.value,m=mkById(id);
      if(m) m.nilai_uas=v;
      call('ubahMatkul',id,{nilai_uas:v}).then(function(){toast('Nilai UAS tersimpan');renderNilai()});
    };
  });
}

/* ---------- atur ---------- */
function renderAtur(){
  $('#sLabel').value=SEM.label; $('#sMulai').value=SEM.mulai_tuton; $('#sUas').value=SEM.tgl_uas||'';
  var list=$('#mkList'); list.innerHTML='';
  var mks=matkulSem();
  if(!mks.length){list.innerHTML='<p style="color:var(--ink3);font-size:14px">Belum ada mata kuliah di semester ini.</p>';return}
  mks.forEach(function(mk){
    var its=itemMatkul(mk.id);
    var row=el('div','mk-line');
    row.innerHTML='<i class="swatch" style="background:'+esc(mk.warna)+'"></i>'+
      '<span style="flex:1;min-width:150px"><span style="font-weight:500">'+esc(mk.nama)+'</span>'+
      '<span style="display:block;font-size:12.5px;color:var(--ink3)">'+esc(mk.kode||'tanpa kode')+' · '+mk.sks+' sks · '+its.length+' item</span></span>';

    var sel=el('select');
    Object.keys(DB.config.pola).forEach(function(k){
      var o=el('option'); o.value=k; o.textContent=DB.config.pola[k];
      if(k===mk.pola) o.selected=true; sel.appendChild(o);
    });
    sel.onchange=function(){
      if(!confirm('Ganti pola '+mk.nama+'? Semua item lama dihapus dan dibuat ulang, termasuk status dan nilai yang sudah diisi.')){
        sel.value=mk.pola; return;
      }
      call('gantiPola',mk.id,sel.value).then(muat).then(function(){toast('Pola '+mk.nama+' diganti')});
    };
    row.appendChild(sel);

    var del=el('button','btn danger small','Hapus');
    del.onclick=function(){
      if(!confirm('Hapus '+mk.nama+' beserta '+its.length+' item dan jadwalnya?')) return;
      DB.matkul=DB.matkul.filter(function(x){return x.id!==mk.id});
      DB.item=DB.item.filter(function(x){return x.matkul_id!==mk.id});
      DB.jadwal=DB.jadwal.filter(function(x){return x.matkul_id!==mk.id});
      render(); call('hapusMatkul',mk.id).then(function(){toast('Mata kuliah dihapus')});
    };

    var tglProfil=el('button','btn ghost small',(mk.profil?'Profil asisten ✓':'Profil asisten'));
    var pro=el('div','mk-profil');
    pro.style.display='none';
    pro.innerHTML='<p>Dipakai buat ngisi prompt asisten. Tulis karakter matkulnya: gaya jawaban yang diharapkan, sumber utama, hal yang wajib ada.</p>';
    var ta=el('textarea');
    ta.value=mk.profil||'';
    ta.placeholder='Contoh: wajib tunjukkan langkah hitungan, bukan cuma hasil akhir. Sumber utama BMP ISIP4215. Sertakan tabel distribusi kalau relevan.';
    ta.onchange=function(){
      mk.profil=ta.value;
      tglProfil.textContent = ta.value.trim() ? 'Profil asisten ✓' : 'Profil asisten';
      call('ubahMatkul',mk.id,{profil:ta.value}).then(function(){toast('Profil disimpan')});
    };
    pro.appendChild(ta);
    tglProfil.onclick=function(){pro.style.display = pro.style.display==='none' ? 'block' : 'none'};

    row.appendChild(tglProfil);
    row.appendChild(del);
    row.appendChild(pro);
    list.appendChild(row);
  });
}

/* ---------- layout ---------- */
var mqMobile=window.matchMedia('(max-width:760px)');
function aturLayout(){
  var sw=$('#semWrap'), tb=$('#topbar'), rl=$('#rail');
  if(!sw||!tb||!rl) return;
  var tujuan = mqMobile.matches ? tb : rl;
  if(sw.parentNode!==tujuan) tujuan.appendChild(sw);
}
if(mqMobile.addEventListener) mqMobile.addEventListener('change',aturLayout);
else window.addEventListener('resize',aturLayout);

/* ---------- events ---------- */
function pindahView(v){
  document.querySelectorAll('#nav button').forEach(function(x){x.classList.toggle('on',x.dataset.v===v)});
  document.querySelectorAll('.view').forEach(function(x){x.classList.remove('on')});
  $('#v-'+v).classList.add('on');
  window.scrollTo(0,0);
}
document.querySelectorAll('#nav button').forEach(function(b){b.onclick=function(){pindahView(b.dataset.v)}});

function jalankanSync(btn, tipeList, labelSukses){
  var teksAsli=btn.textContent;
  btn.disabled=true; btn.textContent='Menyinkronkan…';
  $('#syncInfo').textContent='Sedang menghubungi Google Calendar…';
  call('sinkronSemester',SEM.id,tipeList).then(function(json){
    var h=JSON.parse(json);
    btn.disabled=false; btn.textContent=teksAsli;
    if(h.kosong){
      $('#syncInfo').textContent='Nggak ada yang bisa disinkronkan di semester ini.';
      return;
    }
    var b=[];
    if(h.buat) b.push(h.buat+' event dibuat');
    if(h.perbarui) b.push(h.perbarui+' diperbarui');
    if(h.lewat) b.push(h.lewat+' dilewati');
    $('#syncInfo').textContent=labelSukses+' di kalender "'+h.kalender+'" · '+(b.join(', ')||'tidak ada perubahan')+'.';
    toast('Tersinkron ke Calendar');
    muat();
  }).catch(function(e){
    btn.disabled=false; btn.textContent=teksAsli;
    $('#syncInfo').innerHTML='Gagal mengakses Calendar. Jalankan fungsi <b>cekKalender()</b> sekali di editor Apps Script untuk memberi izin, lalu deploy ulang.<br><span style="color:var(--ink3)">'+esc(e.message||e)+'</span>';
  });
}

$('#syncTuweb').onclick=function(){jalankanSync(this,['tuweb'],'Tuweb tersinkron')};
$('#syncTugas').onclick=function(){jalankanSync(this,['tugas'],'Deadline tugas tersinkron')};
$('#syncUas').onclick=function(){jalankanSync(this,['uas'],'Jadwal UAS tersinkron')};

$('#kalPrev').onclick=function(){geserBulan(-1)};
$('#kalNext').onclick=function(){geserBulan(1)};
$('#kalNow').onclick=function(){var t=d(hariIni());KAL.y=t.getFullYear();KAL.m=t.getMonth();renderKalender()};

$('#scrim').onclick=tutupDrawer;
document.addEventListener('keydown',function(e){if(e.key==='Escape') tutupDrawer()});

$('#semPick').onchange=function(){SEM=DB.semester.filter(function(s){return s.id===$('#semPick').value})[0];KAL.y=null;render()};

$('#sSimpan').onclick=function(){
  var b=$('#sSimpan'); b.disabled=true; b.textContent='Menyimpan…';
  call('ubahSemester',SEM.id,{label:$('#sLabel').value.trim(),mulai_tuton:$('#sMulai').value,tgl_uas:$('#sUas').value})
    .then(muat).then(function(){b.disabled=false;b.textContent='Simpan perubahan';toast('Semester diperbarui')});
};

$('#sBaru').onclick=function(){
  var label=prompt('Nama semester baru:',''); if(!label) return;
  var mulai=prompt('Tanggal Tuton mulai (YYYY-MM-DD):',''); if(!mulai) return;
  call('tambahSemester',{label:label,mulai_tuton:mulai,tgl_uas:''}).then(function(id){SEM={id:id};return muat()})
    .then(function(){toast('Semester '+label+' dibuat')});
};

$('#sDuplikat').onclick=function(){
  var label=prompt('Nama semester baru:',''); if(!label) return;
  var mulai=prompt('Tanggal Tuton mulai (YYYY-MM-DD):',''); if(!mulai) return;
  call('duplikatSemester',SEM.id,label,mulai,'').then(function(id){SEM={id:id};return muat()})
    .then(function(){toast('Matkul disalin ke '+label)});
};

(function(){
  var sel=$('#bulkSesi');
  for(var i=1;i<=8;i++){ var o=el('option'); o.value=i; o.textContent='Sesi '+i; sel.appendChild(o) }
})();

function tandaiSesiMassal(status,teks){
  var sesi=Number($('#bulkSesi').value);
  var kena=itemSem().filter(function(i){return Number(i.sesi)===sesi && i.tipe!=='uas' && aktif(i) && i.status!==status});
  if(!kena.length){ toast('Sesi '+sesi+' sudah '+teks); return }
  if(!confirm('Tandai '+kena.length+' item di sesi '+sesi+' sebagai "'+teks+'" untuk semua mata kuliah?')) return;
  kena.forEach(function(i){ i.status=status });
  render();
  call('tandaiSesi',SEM.id,sesi,status).then(function(n){ toast(n+' item di sesi '+sesi+' ditandai '+teks) })
    .catch(function(){ toast('Gagal menyimpan, muat ulang halaman'); muat() });
}

$('#bulkSelesai').onclick=function(){tandaiSesiMassal('submitted','selesai')};
$('#bulkBelum').onclick=function(){tandaiSesiMassal('belum','belum')};

$('#sLengkapi').onclick=function(){
  var b=this; b.disabled=true; b.textContent='Memeriksa…';
  call('lengkapiItem',SEM.id).then(function(n){
    return muat().then(function(){
      b.disabled=false; b.textContent='Lengkapi item sesuai pola';
      toast(n ? n+' item baru dibuat' : 'Semua item sudah lengkap');
    });
  }).catch(function(){ b.disabled=false; b.textContent='Lengkapi item sesuai pola'; toast('Gagal memeriksa') });
};

$('#mkSimpan').onclick=function(){
  var nama=$('#mkNama').value.trim();
  if(!nama){toast('Nama mata kuliah belum diisi');$('#mkNama').focus();return}
  var b=$('#mkSimpan'); b.disabled=true; b.textContent='Membuat item…';
  call('tambahMatkul',{
    semester_id:SEM.id,kode:$('#mkKode').value.trim(),nama:nama,
    sks:Number($('#mkSks').value)||3,warna:$('#mkWarna').value,
    link_tuton:$('#mkLink').value.trim(),pola:$('#mkPola').value,
    profil:$('#mkProfil').value.trim()
  }).then(muat).then(function(){
    $('#mkKode').value='';$('#mkNama').value='';$('#mkLink').value='';$('#mkProfil').value='';
    b.disabled=false;b.textContent='Tambah mata kuliah';toast(nama+' ditambahkan');
  }).catch(function(){b.disabled=false;b.textContent='Tambah mata kuliah';toast('Gagal menambah')});
};

$('#jdSimpan').onclick=function(){
  if(!$('#jdMk').value){toast('Tambah mata kuliah dulu');return}
  call('tambahJadwal',{
    matkul_id:$('#jdMk').value,hari:Number($('#jdHari').value),
    jam_mulai:$('#jdMulai').value,jam_selesai:$('#jdSelesai').value,
    tipe:$('#jdTipe').value,keterangan:$('#jdKet').value.trim()
  }).then(muat).then(function(){$('#jdKet').value='';toast('Slot ditambahkan')});
};

/* ==================================================================
 *  Sambungan ke Apps Script: layar setup dan panel koneksi
 * ================================================================== */
var URL_CODE_GS='https://github.com/my-razara/dashboard-kuliah/blob/main/apps-script/Code.gs';

function tampilkan(mode,pesan){
  $('#boot').style.display = mode==='boot' ? 'block' : 'none';
  $('#setup').hidden = mode!=='setup';
  $('#shell').style.display = mode==='app' ? 'flex' : 'none';
  if(mode==='boot' && pesan!==undefined) $('#boot').innerHTML=pesan;
}

function cekUrl(u){
  u=String(u||'').trim();
  if(/\/dev(\?|$)/.test(u)) throw galat('Itu URL uji (/dev). Pakai Web app URL yang berakhiran /exec.');
  if(!/^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec$/.test(u.replace(/\?.*$/,''))){
    throw galat('URL harus berupa Web app URL Apps Script, contohnya https://script.google.com/macros/s/…/exec');
  }
  return u.replace(/\?.*$/,'');
}

function ringkasUrl(u){
  var m=String(u||'').match(/\/s\/([\w-]+)\/exec/);
  return m ? '…/s/'+m[1].slice(0,6)+'…'+m[1].slice(-4)+'/exec' : u;
}

function renderSetup(galatAwal){
  $('#setupCard').innerHTML=
    '<div class="setup-head"><span class="setup-mark"><img src="assets/icons/logo.svg" alt="" width="26" height="26">Tuton Tracker</span><h2>Sambungkan ke Apps Script</h2>'+
    '<p>Datanya tetap di Google Sheets lu. Halaman ini cuma tampilan, jadi butuh alamat dan kunci dari Apps Script supaya bisa membaca dan menyimpan data.</p></div>'+
    '<ol class="setup-steps">'+
      '<li><b>Perbarui Code.gs.</b> Salin isi <a target="_blank" rel="noopener" href="'+URL_CODE_GS+'">Code.gs terbaru</a> dan tempel menimpa Code.gs di editor Apps Script, lalu simpan.</li>'+
      '<li><b>Buat kunci.</b> Pilih fungsi <code>buatKunciApi</code>, klik Run, lalu salin kunci yang muncul di log.</li>'+
      '<li><b>Deploy.</b> Deploy → New deployment → Web app, isi:'+
        '<ul><li>Execute as: <b>Me</b></li><li>Who has access: <b>Anyone</b></li></ul>'+
        'Salin <b>Web app URL</b>-nya.</li>'+
      '<li><b>Tempel di bawah.</b></li>'+
    '</ol>'+
    '<div class="field"><label for="suUrl">Web app URL</label><input id="suUrl" type="url" autocapitalize="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec" value="'+esc(API?API.url:'')+'"></div>'+
    '<div class="field"><label for="suKunci">Kunci API</label><input id="suKunci" type="password" autocomplete="off" spellcheck="false" placeholder="hasil buatKunciApi()"></div>'+
    '<div class="setup-err" id="suErr">'+(galatAwal?esc(galatAwal):'')+'</div>'+
    '<div class="btn-row"><button class="btn" id="suGo">Sambungkan</button>'+(DB?'<button class="btn ghost" id="suBatal">Batal</button>':'')+'</div>'+
    '<p class="hint" style="margin-top:14px">"Anyone" berarti URL itu bisa dipanggil tanpa login Google, tapi setiap permintaan ditolak kalau tidak membawa kunci yang benar. Alamat dan kunci disimpan di browser perangkat ini saja; HP dan laptop masing-masing perlu memasukkannya sekali.</p>';
  tampilkan('setup');
  if($('#suBatal')) $('#suBatal').onclick=function(){ tampilkan('app') };
  $('#suGo').onclick=function(){
    var b=this, k;
    $('#suErr').textContent='';
    try{ k={url:cekUrl($('#suUrl').value), kunci:$('#suKunci').value.trim()}; }
    catch(e){ $('#suErr').textContent=e.message; return }
    if(!k.kunci){ $('#suErr').textContent='Kunci API belum diisi.'; return }
    b.disabled=true; b.textContent='Menyambungkan…';
    panggilApi(k,'ping',[]).then(function(){
      API=k;
      try{ localStorage.setItem(KUNCI_KONEKSI,JSON.stringify(k)) }catch(e){}
      tampilkan('boot','Memuat data dari Google Sheets…');
      return muat();
    }).then(function(){ if(DB) toast('Tersambung') }).catch(function(e){
      b.disabled=false; b.textContent='Sambungkan';
      $('#suErr').textContent=e.message;
    });
  };
}

function renderPengaturan(){
  var w=$('#cfgCard'); if(!w||!API) return;
  w.innerHTML=
    '<h3 class="sec-title">Koneksi</h3>'+
    '<div class="cfg-row"><div><b>Apps Script</b><span>'+esc(ringkasUrl(API.url))+'</span></div>'+
      '<button class="btn ghost small" id="cfgMuat">Muat ulang data</button></div>'+
    '<p class="hint">Data, Google Calendar, dan pengingat email semuanya tetap dijalankan Apps Script. Kalau Code.gs diubah, buat deployment versi baru di URL yang sama: Deploy → Manage deployments → edit → Version: New version.</p>'+
    '<h4 class="cfg-sub">Perangkat ini</h4>'+
    '<div class="btn-row">'+
      '<button class="btn ghost small" id="cfgGanti">Ganti URL atau kunci</button>'+
      '<button class="btn danger small" id="cfgPutus">Putuskan perangkat ini</button>'+
    '</div>'+
    '<p class="hint">Kalau HP hilang, jalankan <code>buatKunciApi</code> lagi di editor. Kunci lama langsung tidak berlaku di semua perangkat, lalu masukkan kunci baru di perangkat yang masih lu pakai.</p>';
  $('#cfgMuat').onclick=function(){
    var b=this; b.disabled=true;
    muat().then(function(){ b.disabled=false; toast('Data terbaru dimuat') });
  };
  $('#cfgGanti').onclick=function(){ renderSetup() };
  $('#cfgPutus').onclick=function(){
    if(!confirm('Putuskan perangkat ini? Data di Google Sheets tidak tersentuh, cuma alamat dan kunci di browser ini yang dihapus.')) return;
    try{ localStorage.removeItem(KUNCI_KONEKSI); localStorage.removeItem(KUNCI_CACHE) }catch(e){}
    location.reload();
  };
}

function mulai(){
  if(!API){ renderSetup(); return }
  // Tampilkan salinan terakhir dulu supaya langsung kebuka, lalu ambil data terbaru.
  var cache=null;
  try{ cache=localStorage.getItem(KUNCI_CACHE) }catch(e){}
  if(cache){ try{ terapkanData(cache) }catch(e){ cache=null } }
  if(!cache) tampilkan('boot','Memuat data dari Google Sheets…');
  muat();
}

mulai();
