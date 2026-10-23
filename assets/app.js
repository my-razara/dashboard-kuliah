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

function muat(){
  DB=Store.view;
  if(!DB) return Promise.resolve();
  DB.config=Store.uiConfig();
  DB.hariIni=Store.hariIni();
  if(!DB.semester.length){
    call('tambahSemester',{label:'Semester baru',mulai_tuton:DB.hariIni,tgl_uas:''});
  }
  var aktifSem=DB.semester.filter(function(s){return s.status==='aktif'})[0]||DB.semester[0];
  SEM = SEM ? (DB.semester.filter(function(s){return s.id===SEM.id})[0]||aktifSem) : aktifSem;
  tampilkan('app');
  aturLayout();
  render();
  return Promise.resolve();
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
  call('ubahItem',id,patch).catch(function(e){toast(e.message)});
}

/* ---------- jadwal + tuweb ---------- */
/* ---------- Google Calendar (tanpa server) ----------
 * Tombol per item membuka Google Calendar dengan acara yang sudah terisi.
 * Dashboard mencatat jadwal saat tombol ditekan, jadi kalau tanggal atau jam
 * berubah sesudahnya, lu dikasih tahu bahwa event di kalender perlu diganti.
 */
function pad2(n){return (n<10?'0':'')+n}

function waktuAcara(it){
  var timed=(it.tipe==='tuweb') || (it.tipe==='uas' && it.jam);
  if(!timed) return null;
  var jam=(it.jam||Store.CONFIG.JAM_TUWEB_DEFAULT).split(':');
  var t=it.deadline.split('-');
  var durasi=it.tipe==='tuweb'?Store.CONFIG.DURASI_TUWEB_MENIT:Store.CONFIG.DURASI_UAS_MENIT;
  // Hitung jam dinding Jakarta lewat UTC supaya aman dari DST perangkat.
  var mulai=new Date(Date.UTC(+t[0],+t[1]-1,+t[2],+jam[0]||0,+jam[1]||0));
  var selesai=new Date(mulai.getTime()+durasi*60000);
  return {mulai:mulai,selesai:selesai};
}
function fmtLokal(dt){
  return dt.getUTCFullYear()+pad2(dt.getUTCMonth()+1)+pad2(dt.getUTCDate())+'T'+pad2(dt.getUTCHours())+pad2(dt.getUTCMinutes())+'00';
}
function tglBesok(s){var x=d(s);x.setDate(x.getDate()+1);return x.getFullYear()+pad2(x.getMonth()+1)+pad2(x.getDate())}

function judulAcara(it){var mk=mkById(it.matkul_id);return namaItem(it)+' · '+(mk?mk.nama:'')}
function deskripsiAcara(it){
  var mk=mkById(it.matkul_id)||{}, b=[];
  b.push((mk.kode?mk.kode+' · ':'')+(it.tipe==='uas'?'Ujian Akhir Semester':'Sesi '+it.sesi));
  if(it.tipe==='tuweb' && it.link) b.push('Ruang Tuweb: '+it.link);
  if(it.tipe!=='tuweb' && mk.link_tuton) b.push('Ruang Tuton: '+mk.link_tuton);
  if(it.catatan) b.push('',it.catatan);
  b.push('','Dari Tuton Tracker');
  return b.join('\n');
}

function urlGcal(it){
  var p=new URLSearchParams();
  p.set('action','TEMPLATE');
  p.set('text',judulAcara(it));
  var w=waktuAcara(it);
  if(w){ p.set('dates',fmtLokal(w.mulai)+'/'+fmtLokal(w.selesai)); p.set('ctz','Asia/Jakarta'); }
  else p.set('dates',it.deadline.replace(/-/g,'')+'/'+tglBesok(it.deadline));
  p.set('details',deskripsiAcara(it));
  if(it.tipe==='tuweb' && it.link) p.set('location',it.link);
  return 'https://calendar.google.com/calendar/render?'+p.toString();
}
function urlHariGcal(tgl){var t=tgl.split('-');return 'https://calendar.google.com/calendar/r/day/'+t[0]+'/'+(+t[1])+'/'+(+t[2])}
function jejakKal(it){return it.deadline+'|'+(it.tipe==='tuweb'?(it.jam||Store.CONFIG.JAM_TUWEB_DEFAULT):(it.jam||''))}

function kontrolKalender(it,inline){
  var wrap=el('span','tw-sync'+(inline?' kal-inline':''));
  function gambar(){
    wrap.innerHTML='';
    wrap.className='tw-sync'+(inline?' kal-inline':'');
    if(!it.deadline){ wrap.appendChild(el('span',null,'Isi tanggal dulu untuk menambahkan ke Google Calendar')); return }
    if(it.kal_jejak){
      var berubah=it.kal_jejak!==jejakKal(it);
      wrap.classList.add(berubah?'beda':'on');
      wrap.appendChild(el('i'));
      wrap.appendChild(el('span',null,berubah?'Jadwal berubah sejak ditambahkan — hapus event lama di kalender':'Sudah ditambahkan ke Google Calendar'));
      var buka=el('a','lepas','buka kalender'); buka.href=urlHariGcal((berubah?it.kal_jejak:it.deadline).split('|')[0]); buka.target='_blank'; buka.rel='noopener';
      wrap.appendChild(buka);
      var lagi=el('button','lepas',berubah?'tambah versi baru':'tambah lagi'); lagi.onclick=tambah;
      wrap.appendChild(lagi);
    } else {
      var b=el('button','btn ghost small','Tambah ke Google Calendar'); b.onclick=tambah;
      wrap.appendChild(b);
    }
  }
  function tambah(){
    window.open(urlGcal(it),'_blank','noopener');
    var p={kal_jejak:jejakKal(it)};
    it.kal_jejak=p.kal_jejak;
    call('ubahItem',it.id,p);
    gambar();
  }
  gambar();
  return wrap;
}

/* File .ics untuk menambahkan banyak acara sekaligus */
function escIcs(t){return String(t||'').replace(/\\/g,'\\\\').replace(/;/g,'\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n')}
function lipatIcs(baris){
  var out=[],sisa=baris;
  while(sisa.length>73){out.push(sisa.slice(0,73));sisa=' '+sisa.slice(73)}
  out.push(sisa); return out.join('\r\n');
}
function unduhIcs(tipeList,namaFile){
  var items=itemSem().filter(function(i){return tipeList.indexOf(i.tipe)>=0 && aktif(i) && i.deadline && i.status!=='submitted'});
  if(!items.length){ toast('Nggak ada jadwal yang bisa diunduh'); return 0 }
  var now=new Date(), stamp=now.getUTCFullYear()+pad2(now.getUTCMonth()+1)+pad2(now.getUTCDate())+'T'+pad2(now.getUTCHours())+pad2(now.getUTCMinutes())+'00Z';
  var L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Tuton Tracker//ID','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-TIMEZONE:Asia/Jakarta'];
  items.forEach(function(it){
    L.push('BEGIN:VEVENT','UID:'+it.id+'@tuton-tracker','DTSTAMP:'+stamp);
    var w=waktuAcara(it);
    if(w){
      // Jam dinding Jakarta (UTC+7) diubah ke UTC.
      var m=new Date(w.mulai.getTime()-7*3600000), e=new Date(w.selesai.getTime()-7*3600000);
      L.push('DTSTART:'+fmtLokal(m)+'Z','DTEND:'+fmtLokal(e)+'Z');
      L.push('BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+escIcs(judulAcara(it)),'TRIGGER:-P1D','END:VALARM');
      L.push('BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+escIcs(judulAcara(it)),'TRIGGER:-PT1H','END:VALARM');
    } else {
      L.push('DTSTART;VALUE=DATE:'+it.deadline.replace(/-/g,''),'DTEND;VALUE=DATE:'+tglBesok(it.deadline));
    }
    L.push('SUMMARY:'+escIcs(judulAcara(it)),'DESCRIPTION:'+escIcs(deskripsiAcara(it)));
    if(it.tipe==='tuweb' && it.link) L.push('LOCATION:'+escIcs(it.link));
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  unduhTeks(L.map(lipatIcs).join('\r\n')+'\r\n', namaFile, 'text/calendar');
  return items.length;
}

function unduhTeks(teks,nama,tipe){
  var blob=new Blob([teks],{type:(tipe||'text/plain')+';charset=utf-8'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=nama;
  document.body.appendChild(a); a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1000);
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

$('#icsTuweb').onclick=function(){
  var n=unduhIcs(['tuweb'],'tuweb-'+SEM.label+'.ics');
  if(n) toast(n+' Tuweb diunduh. Impor di Google Calendar.');
};
$('#icsTugas').onclick=function(){
  var n=unduhIcs(['tugas'],'tugas-'+SEM.label+'.ics');
  if(n) toast(n+' deadline tugas diunduh. Impor di Google Calendar.');
};
$('#icsUas').onclick=function(){
  var n=unduhIcs(['uas'],'uas-'+SEM.label+'.ics');
  if(n) toast(n+' jadwal UAS diunduh. Impor di Google Calendar.');
};

$('#kalPrev').onclick=function(){geserBulan(-1)};
$('#kalNext').onclick=function(){geserBulan(1)};
$('#kalNow').onclick=function(){var t=d(hariIni());KAL.y=t.getFullYear();KAL.m=t.getMonth();renderKalender()};

$('#scrim').onclick=tutupDrawer;
document.addEventListener('keydown',function(e){if(e.key==='Escape') tutupDrawer()});

$('#semPick').onchange=function(){SEM=DB.semester.filter(function(s){return s.id===$('#semPick').value})[0];KAL.y=null;render()};

$('#sSimpan').onclick=function(){
  var b=$('#sSimpan'); b.disabled=true; b.textContent='Menyimpan…';
  call('ubahSemester',SEM.id,{label:$('#sLabel').value.trim(),mulai_tuton:$('#sMulai').value,tgl_uas:$('#sUas').value})
    .then(muat).then(function(){b.disabled=false;b.textContent='Simpan perubahan';toast('Semester diperbarui')})
    .catch(function(e){b.disabled=false;b.textContent='Simpan perubahan';toast(e.message)});
};

$('#sBaru').onclick=function(){
  var label=prompt('Nama semester baru:',''); if(!label) return;
  var mulai=prompt('Tanggal Tuton mulai (YYYY-MM-DD):',''); if(!mulai) return;
  call('tambahSemester',{label:label,mulai_tuton:mulai.trim(),tgl_uas:''}).then(function(id){SEM={id:id};return muat()})
    .then(function(){toast('Semester '+label+' dibuat')}).catch(function(e){toast(e.message)});
};

$('#sDuplikat').onclick=function(){
  var label=prompt('Nama semester baru:',''); if(!label) return;
  var mulai=prompt('Tanggal Tuton mulai (YYYY-MM-DD):',''); if(!mulai) return;
  call('duplikatSemester',SEM.id,label,mulai.trim(),'').then(function(id){SEM={id:id};return muat()})
    .then(function(){toast('Matkul disalin ke '+label)}).catch(function(e){toast(e.message)});
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
  call('tandaiSesi',SEM.id,sesi,status).then(function(n){ render(); toast(n+' item di sesi '+sesi+' ditandai '+teks) })
    .catch(function(e){ toast(e.message) });
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
 *  Setup, status simpan, dan pengaturan penyimpanan
 * ================================================================== */
var DALAM_SETUP=false, ADA_PENGINGAT=null;

function tampilkan(mode,pesan){
  $('#boot').style.display = mode==='boot' ? 'block' : 'none';
  $('#setup').hidden = mode!=='setup';
  $('#shell').style.display = mode==='app' ? 'flex' : 'none';
  if(mode==='boot' && pesan!==undefined) $('#boot').innerHTML=pesan;
}

function repoBawaan(){
  var h=location.hostname;
  var owner=/\.github\.io$/i.test(h) ? h.split('.')[0] : 'my-razara';
  return owner+'/dashboard-kuliah-data';
}

function kepalaSetup(judul,teks){
  return '<div class="setup-head"><span class="setup-mark">Tuton Tracker</span><h2>'+judul+'</h2>'+(teks?'<p>'+teks+'</p>':'')+'</div>';
}

/* ---------- langkah 1: sambungkan repo ---------- */
function renderSetupKoneksi(galat){
  DALAM_SETUP=true;
  var repo=repoBawaan(), namaRepo=repo.split('/')[1];
  $('#setupCard').innerHTML=
    kepalaSetup('Sambungkan penyimpanan','Halaman ini cuma tampilan. Data kuliah lu disimpan di repo GitHub <b>private</b> milik lu sendiri, jadi nggak bisa dibaca orang lain walaupun halaman ini publik.')+
    '<ol class="setup-steps">'+
      '<li><b>Bikin repo private kosong.</b> <a target="_blank" rel="noopener" href="https://github.com/new?name='+encodeURIComponent(namaRepo)+'&visibility=private&description='+encodeURIComponent('Data Tuton Tracker')+'">Buka formulir repo baru</a>. Namanya sudah terisi, pastikan yang dipilih <b>Private</b>.</li>'+
      '<li><b>Bikin token akses.</b> <a target="_blank" rel="noopener" href="https://github.com/settings/personal-access-tokens/new">Buka halaman token</a>, lalu atur:'+
        '<ul>'+
          '<li>Repository access: <b>Only select repositories</b>, pilih repo tadi</li>'+
          '<li>Permissions → <b>Contents</b>: Read and write</li>'+
          '<li>Permissions → <b>Workflows</b>: Read and write <span class="muted">(buat pasang pengingat email)</span></li>'+
          '<li>Expiration: pilih yang paling lama, dan catat tanggalnya</li>'+
        '</ul></li>'+
      '<li><b>Tempel di bawah.</b></li>'+
    '</ol>'+
    '<div class="field"><label for="suRepo">Repo data</label><input id="suRepo" value="'+esc(repo)+'" autocapitalize="off" spellcheck="false"></div>'+
    '<div class="field"><label for="suToken">Token</label><input id="suToken" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…"></div>'+
    '<div class="setup-err" id="suErr">'+(galat?esc(galat):'')+'</div>'+
    '<div class="btn-row"><button class="btn" id="suGo">Sambungkan</button></div>'+
    '<p class="hint" style="margin-top:14px">Token disimpan di browser perangkat ini saja dan cuma bisa menyentuh repo yang lu pilih. HP dan laptop masing-masing perlu memasukkannya sekali.</p>';
  tampilkan('setup');
  $('#suGo').onclick=function(){
    var b=this; b.disabled=true; b.textContent='Menyambungkan…'; $('#suErr').textContent='';
    Store.sambungkan($('#suRepo').value,$('#suToken').value).then(function(){
      return Store.tarik();
    }).then(function(hasil){
      if(hasil==='kosong') renderSetupData();
      else { DALAM_SETUP=false; cekStatusPengingat(); muat(); toast('Tersambung ke '+Store.repo()); }
    }).catch(function(e){
      b.disabled=false; b.textContent='Sambungkan';
      $('#suErr').textContent=e.message;
    });
  };
}

/* ---------- langkah 2: isi data awal ---------- */
function sesiLewatSeed(){
  var hari=Math.floor((d(Store.hariIni())-d('2026-09-14'))/86400000);
  return Math.max(0,Math.min(8,Math.floor(hari/7)));
}

function renderSetupData(){
  DALAM_SETUP=true;
  var lewat=sesiLewatSeed(), opsiSesi='';
  for(var i=0;i<=8;i++) opsiSesi+='<option value="'+i+'"'+(i===lewat?' selected':'')+'>'+(i===0?'Belum ada':'Sesi '+i)+'</option>';
  $('#setupCard').innerHTML=
    kepalaSetup('Isi data awal','Repo <b>'+esc(Store.repo())+'</b> tersambung dan masih kosong. Pilih dari mana datanya.')+
    '<div class="opsi">'+
      '<div class="opsi-item utama">'+
        '<h3>Pindahkan dari Google Sheets lama</h3>'+
        '<p>Buka spreadsheet Tuton Tracker lama → <b>File → Download → Microsoft Excel (.xlsx)</b>, lalu pilih file itu di sini. Status, nilai, catatan, tanggal Tuweb, dan slot jadwal ikut pindah.</p>'+
        '<label class="btn file-btn">Pilih file .xlsx<input type="file" accept=".xlsx" id="suXlsx" hidden></label>'+
      '</div>'+
      '<div class="opsi-item">'+
        '<h3>Pulihkan dari cadangan</h3>'+
        '<p>File .json dari tombol Unduh cadangan.</p>'+
        '<label class="btn ghost file-btn">Pilih file .json<input type="file" accept=".json,application/json" id="suJson" hidden></label>'+
      '</div>'+
      '<div class="opsi-item">'+
        '<h3>Mulai dengan 7 mata kuliah semester ini</h3>'+
        '<p>Semester 2026.1, Tuton mulai 14 September, UAS 23 November. Kode matkul dikosongkan, isi sendiri nanti.</p>'+
        '<div class="row-inline"><label for="suSesi">Tandai selesai sampai</label><select id="suSesi">'+opsiSesi+'</select></div>'+
        '<button class="btn ghost" id="suSeed">Buat data</button>'+
      '</div>'+
    '</div>'+
    '<div id="suPratinjau"></div>'+
    '<div class="setup-err" id="suErr"></div>'+
    '<p class="hint" style="margin-top:14px"><button class="lepas" id="suGanti">Pakai repo atau token lain</button></p>';
  tampilkan('setup');

  function pilihFile(input){
    var f=input.files[0]; if(!f) return;
    $('#suErr').textContent=''; $('#suPratinjau').innerHTML='<p class="hint">Membaca '+esc(f.name)+'…</p>';
    Store.bacaFileImpor(f).then(function(mentah){
      var h=Store.rapikanImpor(mentah);
      pratinjau(h, /\.json$/i.test(f.name)?'Pulihkan dari cadangan':'Impor dari Google Sheets');
    }).catch(function(e){ $('#suPratinjau').innerHTML=''; $('#suErr').textContent=e.message; })
      .then(function(){ input.value=''; });
  }
  $('#suXlsx').onchange=function(){pilihFile(this)};
  $('#suJson').onchange=function(){pilihFile(this)};
  $('#suSeed').onclick=function(){
    var n=Number($('#suSesi').value);
    simpanAwal(Store.dataAwal(n),'Buat data awal 7 mata kuliah',this);
  };
  $('#suGanti').onclick=function(){ Store.putuskan(); renderSetupKoneksi(); };
}

function ringkasData(db){
  var aktifSem=db.semester.filter(function(s){return s.status==='aktif'})[0];
  return db.semester.length+' semester'+(aktifSem?' (aktif: '+esc(aktifSem.label)+')':'')+', '+
    db.matkul.length+' mata kuliah, '+db.item.length+' item, '+db.jadwal.length+' slot jadwal';
}

function pratinjau(h,pesan){
  var w=$('#suPratinjau');
  w.innerHTML='<div class="pratinjau"><b>Siap disimpan.</b> '+ringkasData(h.db)+'.'+
    (h.tambahan?' <span class="muted">'+h.tambahan+' item ditambahkan karena belum ada di versi lama (misalnya daftar hadir dan UAS).</span>':'')+
    '<div class="btn-row" style="margin-top:10px"><button class="btn" id="suSimpan">Simpan ke GitHub</button></div></div>';
  $('#suSimpan').onclick=function(){ simpanAwal(h.db,pesan,this); };
  w.scrollIntoView({block:'nearest'});
}

function simpanAwal(db,pesan,tombol){
  if(tombol){ tombol.disabled=true; tombol.textContent='Menyimpan…'; }
  $('#suErr').textContent='';
  var hasilPengingat=null;
  Store.buatData(db,pesan).then(function(){
    return Store.pasangPengingat().then(function(h){hasilPengingat=h});
  }).then(function(){
    renderSetupSelesai(hasilPengingat);
  }).catch(function(e){
    if(tombol){ tombol.disabled=false; tombol.textContent='Coba lagi'; }
    $('#suErr').textContent=e.message;
  });
}

/* ---------- langkah 3: selesai ---------- */
function renderSetupSelesai(hasil){
  var wf=(hasil||[]).filter(function(h){return /workflows/.test(h.file)})[0];
  ADA_PENGINGAT = wf ? wf.ok : null;
  var baris='<li class="ok">Data tersimpan di <a target="_blank" rel="noopener" href="https://github.com/'+esc(Store.repo())+'">'+esc(Store.repo())+'</a></li>';
  baris+= wf && wf.ok
    ? '<li class="ok">File pengingat email terpasang</li>'
    : '<li class="gagal">File pengingat email belum terpasang'+(wf?': '+esc(wf.ket):'')+'</li>';
  $('#setupCard').innerHTML=
    kepalaSetup('Siap dipakai','')+
    '<ul class="cek">'+baris+'</ul>'+
    '<p>Satu langkah lagi supaya email pengingat benar-benar terkirim: isi dua secret Gmail di repo data. Panduannya ada di <b>Atur → Penyimpanan &amp; pengingat</b>. Bisa dikerjakan nanti.</p>'+
    '<div class="btn-row"><button class="btn" id="suMasuk">Buka dashboard</button></div>';
  tampilkan('setup');
  $('#suMasuk').onclick=function(){ DALAM_SETUP=false; SEM=null; muat(); };
}

/* ---------- status simpan ---------- */
var STATUS_TEKS={
  tersimpan:['Tersimpan','ok'], menunggu:['Menyimpan…','sibuk'], menyimpan:['Menyimpan…','sibuk'],
  offline:['Offline','warn'], akses:['Token bermasalah','err'], galat:['Gagal menyimpan','err'],
  diam:['Memuat…','sibuk'], kosong:['Data kosong','warn']
};
var statusSebelum='';
function renderStatus(){
  var st=Store.status(), t=STATUS_TEKS[st.status]||['',''];
  var teks=t[0]+(st.pending && (st.status==='offline'||st.status==='galat'||st.status==='akses')?' · '+st.pending+' menunggu':'');
  var pill=$('#syncPill');
  if(pill){
    pill.className='sync-pill '+t[1];
    pill.querySelector('span').textContent=teks;
    pill.title=st.pesan||teks;
  }
  if(st.status!==statusSebelum && (st.status==='akses'||st.status==='galat') && !DALAM_SETUP) toast(st.pesan||teks);
  statusSebelum=st.status;
  var cs=$('#cfgStatus'); if(cs) cs.textContent=keteranganStatus(st);
}
function keteranganStatus(st){
  var t=(STATUS_TEKS[st.status]||[''])[0];
  var kapan=st.terakhir ? ' · terakhir sinkron '+new Date(st.terakhir).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) : '';
  var tunggu=st.pending ? ' · '+st.pending+' perubahan belum terkirim' : '';
  return t+kapan+tunggu+(st.pesan && st.status!=='tersimpan' ? '. '+st.pesan : '');
}

function cekStatusPengingat(){
  Store.cekPengingat().then(function(ada){ ADA_PENGINGAT=ada; var r=$('#cfgRem'); if(r) r.innerHTML=labelPengingat(); });
}
function labelPengingat(){
  if(ADA_PENGINGAT===true) return '<span class="tag ok">terpasang</span>';
  if(ADA_PENGINGAT===false) return '<span class="tag warn">belum terpasang</span>';
  return '<span class="tag">belum dicek</span>';
}

/* ---------- panel pengaturan ---------- */
function renderPengaturan(){
  var w=$('#cfgCard'); if(!w) return;
  var repo=Store.repo(), gh='https://github.com/'+repo;
  w.innerHTML=
    '<h3 class="sec-title">Penyimpanan &amp; pengingat</h3>'+
    '<div class="cfg-row"><div><b>Repo data</b><span>'+esc(repo)+' · private</span></div>'+
      '<a class="btn ghost small" target="_blank" rel="noopener" href="'+gh+'">Buka repo</a></div>'+
    '<div class="cfg-row"><div><b>Status</b><span id="cfgStatus">'+esc(keteranganStatus(Store.status()))+'</span></div>'+
      '<button class="btn ghost small" id="cfgSync">Sinkronkan sekarang</button></div>'+

    '<h4 class="cfg-sub">Pengingat email</h4>'+
    '<ol class="cfg-steps">'+
      '<li>File pengingat di repo data: <span id="cfgRem">'+labelPengingat()+'</span> <button class="lepas" id="cfgPasang">pasang / perbarui</button></li>'+
      '<li>Bikin App Password Gmail di <a target="_blank" rel="noopener" href="https://myaccount.google.com/apppasswords">myaccount.google.com/apppasswords</a>. Butuh verifikasi 2 langkah yang sudah aktif.</li>'+
      '<li>Isi secret di <a target="_blank" rel="noopener" href="'+gh+'/settings/secrets/actions">Settings → Secrets and variables → Actions</a>: '+
        '<code>GMAIL_USER</code> berisi alamat Gmail, <code>GMAIL_APP_PASSWORD</code> berisi 16 huruf tadi. Opsional <code>EMAIL_TO</code> kalau mau dikirim ke alamat lain.</li>'+
      '<li>Uji di <a target="_blank" rel="noopener" href="'+gh+'/actions/workflows/reminder.yml">Actions → Pengingat Tuton</a> → <b>Run workflow</b> dengan mode <b>tes</b>.</li>'+
    '</ol>'+
    '<p class="hint">Jalan tiap pagi sekitar 06.40 WIB. Senin: rekap seminggu ke depan. Hari lain: cuma kalau ada Tuweb atau UAS besok atau hari ini, atau deadline yang jatuh hari itu.</p>'+

    '<h4 class="cfg-sub">Cadangan</h4>'+
    '<div class="btn-row">'+
      '<button class="btn ghost small" id="cfgUnduh">Unduh cadangan (.json)</button>'+
      '<label class="btn ghost small file-btn">Ganti semua data dari file…<input type="file" accept=".json,.xlsx" id="cfgImpor" hidden></label>'+
    '</div>'+
    '<p class="hint">Tiap perubahan juga tersimpan sebagai commit di repo data, jadi versi lama selalu bisa dilihat atau dipulihkan dari riwayatnya.</p>'+

    '<h4 class="cfg-sub">Perangkat ini</h4>'+
    '<button class="btn danger small" id="cfgPutus">Putuskan perangkat ini</button>'+
    '<p class="hint">Menghapus token dari browser ini. Data di GitHub tidak tersentuh.</p>';

  $('#cfgSync').onclick=function(){
    var b=this; b.disabled=true;
    Store.kirimSekarang().then(function(){return Store.tarik()}).then(function(r){
      b.disabled=false; toast(r==='berubah'?'Data terbaru dimuat':'Sudah sinkron');
    }).catch(function(e){ b.disabled=false; toast(e.message) });
  };
  $('#cfgPasang').onclick=function(){
    var b=this; b.disabled=true; b.textContent='memasang…';
    Store.pasangPengingat().then(function(hasil){
      var gagal=hasil.filter(function(h){return !h.ok});
      var wf=hasil.filter(function(h){return /workflows/.test(h.file)})[0];
      ADA_PENGINGAT = wf ? wf.ok : ADA_PENGINGAT;
      $('#cfgRem').innerHTML=labelPengingat();
      b.disabled=false; b.textContent='pasang / perbarui';
      toast(gagal.length ? gagal[0].ket : 'File pengingat sudah terbaru');
    });
  };
  $('#cfgUnduh').onclick=function(){
    unduhTeks(Store.eksporJson(),'tuton-tracker-'+Store.hariIni()+'.json','application/json');
  };
  $('#cfgImpor').onchange=function(){
    var input=this, f=input.files[0]; if(!f) return;
    Store.bacaFileImpor(f).then(function(mentah){
      var h=Store.rapikanImpor(mentah);
      if(!confirm('Ganti SELURUH data dengan isi file ini?\n\n'+ringkasData(h.db).replace(/<[^>]+>/g,'')+'.\n\nData sekarang tetap bisa dipulihkan dari riwayat commit di repo.')) return;
      Store.gantiSemua(h.db); SEM=null; muat(); toast('Data diganti dari '+f.name);
    }).catch(function(e){ toast(e.message) }).then(function(){ input.value=''; });
  };
  $('#cfgPutus').onclick=function(){
    var st=Store.status();
    var pesan='Putuskan perangkat ini dari '+repo+'?'+(st.pending?'\n\nAda '+st.pending+' perubahan yang BELUM terkirim ke GitHub dan akan hilang.':'');
    if(!confirm(pesan)) return;
    Store.putuskan(); location.reload();
  };
}

/* ---------- mulai ---------- */
function mulai(){
  Store.init();
  Store.on('data',function(){ if(!DALAM_SETUP) muat(); });
  Store.on('status',renderStatus);
  $('#syncPill').onclick=function(){ pindahView('atur'); var c=$('#cfgCard'); if(c) c.scrollIntoView({block:'start'}); };

  if(!Store.tersambung()){ renderSetupKoneksi(); return; }
  if(Store.view) muat(); else tampilkan('boot','Memuat data dari GitHub…');

  Store.tarik().then(function(r){
    if(r==='kosong'){ renderSetupData(); return; }
    cekStatusPengingat();
  }).catch(function(e){
    if(Store.view) return;   // tetap pakai salinan di perangkat, status sudah ditandai
    tampilkan('boot',
      '<b style="display:block;color:var(--ink);font-size:16px;margin-bottom:6px">Gagal memuat data</b>'+esc(e.message)+
      '<div class="btn-row" style="justify-content:center;margin-top:14px">'+
        '<button class="btn" id="bootUlang">Coba lagi</button>'+
        '<button class="btn ghost" id="bootGanti">Ganti repo atau token</button></div>');
    $('#bootUlang').onclick=function(){ location.reload(); };
    $('#bootGanti').onclick=function(){ Store.putuskan(); renderSetupKoneksi(); };
  });
}

mulai();
