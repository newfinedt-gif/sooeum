const URL='https://senrhkdnsrpcnjvigzfq.supabase.co';
const KEY='sb_publishable_uvOL2lGthR-PNI9tlNoBjA_-8ieB4qx';

// Academy Finance v7: 외부 Supabase JS CDN 없이 REST/Auth API를 직접 사용합니다.
const sb=(()=>{
  const STORAGE='academy_finance_session_v1';
  let listeners=[];
  let session=null;

  function loadStored(){
    try{
      const raw=localStorage.getItem(STORAGE);
      if(!raw)return null;
      const s=JSON.parse(raw);
      if(!s?.access_token)return null;
      return s;
    }catch(_){ return null; }
  }
  function saveStored(s){
    session=s||null;
    try{
      if(s)localStorage.setItem(STORAGE,JSON.stringify(s));
      else localStorage.removeItem(STORAGE);
    }catch(_){}
  }
  session=loadStored();

  function emit(event,s){
    listeners.forEach(fn=>{try{fn(event,s)}catch(e){console.error(e)}});
  }
  function headers(extra={}){
    const h={
      'apikey':KEY,
      'Content-Type':'application/json',
      ...extra
    };
    if(session?.access_token)h['Authorization']='Bearer '+session.access_token;
    else h['Authorization']='Bearer '+KEY;
    return h;
  }
  async function parseResponse(r){
    let body=null;
    const text=await r.text();
    if(text){
      try{body=JSON.parse(text)}catch(_){body=text}
    }
    if(!r.ok){
      const msg=body?.msg||body?.message||body?.error_description||body?.error||`HTTP ${r.status}`;
      return {data:null,error:{message:String(msg),status:r.status,details:body}};
    }
    return {data:body,error:null};
  }
  async function authRequest(path,body,method='POST'){
    try{
      const r=await fetch(URL+'/auth/v1/'+path,{
        method,
        headers:{'apikey':KEY,'Content-Type':'application/json',...(session?.access_token?{'Authorization':'Bearer '+session.access_token}:{})},
        body:body===undefined?undefined:JSON.stringify(body)
      });
      return await parseResponse(r);
    }catch(e){return {data:null,error:{message:e.message||String(e)}}}
  }

  class Query{
    constructor(table){
      this.table=table; this.params=new URLSearchParams(); this._single=false;
    }
    select(cols='*'){this.params.set('select',cols);return this}
    eq(col,val){this.params.set(col,'eq.'+val);return this}
    gte(col,val){this.params.set(col,'gte.'+val);return this}
    lte(col,val){this.params.set(col,'lte.'+val);return this}
    order(col,opt={}){
      this.params.set('order',`${col}.${opt.ascending===false?'desc':'asc'}`);
      return this
    }
    limit(n){this.params.set('limit',String(n));return this}
    maybeSingle(){this._single=true;return this}
    async execute(){
      try{
        const r=await fetch(URL+'/rest/v1/'+encodeURIComponent(this.table)+'?'+this.params.toString(),{
          headers:headers({'Accept':'application/json'})
        });
        const out=await parseResponse(r);
        if(out.error)return out;
        if(this._single){
          const arr=Array.isArray(out.data)?out.data:[out.data];
          return {data:arr[0]||null,error:null};
        }
        return out;
      }catch(e){return {data:null,error:{message:e.message||String(e)}}}
    }
    then(resolve,reject){return this.execute().then(resolve,reject)}
  }

  const auth={
    async signInWithPassword({email,password}){
      const out=await authRequest('token?grant_type=password',{email,password});
      if(out.error)return out;
      const d=out.data||{};
      const s={
        access_token:d.access_token,
        refresh_token:d.refresh_token,
        expires_in:d.expires_in,
        token_type:d.token_type||'bearer',
        user:d.user
      };
      saveStored(s); emit('SIGNED_IN',s);
      return {data:{session:s,user:d.user},error:null};
    },
    async signUp({email,password}){
      const cleanEmail=String(email||'').trim();
      const cleanPassword=String(password||'');
      if(!cleanEmail)return {data:null,error:{message:'이메일을 입력해주세요.'}};
      if(cleanPassword.length<6)return {data:null,error:{message:'비밀번호는 6자 이상 입력해주세요.'}};

      try{
        const r=await fetch(URL+'/auth/v1/signup',{
          method:'POST',
          headers:{
            'apikey':KEY,
            'Authorization':'Bearer '+KEY,
            'Content-Type':'application/json'
          },
          body:JSON.stringify({email:cleanEmail,password:cleanPassword})
        });
        const out=await parseResponse(r);
        if(out.error)return out;

        const d=out.data||{};
        let s=null;
        if(d.access_token){
          s={
            access_token:d.access_token,
            refresh_token:d.refresh_token,
            expires_in:d.expires_in,
            token_type:d.token_type||'bearer',
            user:d.user
          };
          saveStored(s);
          emit('SIGNED_IN',s);
        }
        return {data:{session:s,user:d.user||d},error:null};
      }catch(e){
        return {data:null,error:{message:e.message||String(e)}};
      }
    },
    async signOut(){
      try{
        if(session?.access_token)await authRequest('logout',undefined,'POST');
      }catch(_){}
      saveStored(null); emit('SIGNED_OUT',null);
      return {error:null};
    },
    async getSession(){
      session=loadStored();
      return {data:{session},error:null};
    },
    onAuthStateChange(fn){
      listeners.push(fn);
      return {data:{subscription:{unsubscribe(){listeners=listeners.filter(x=>x!==fn)}}}};
    }
  };

  return {
    auth,
    from(table){return new Query(table)},
    async rpc(name,args={}){
      try{
        const r=await fetch(URL+'/rest/v1/rpc/'+encodeURIComponent(name),{
          method:'POST',
          headers:headers({'Prefer':'return=representation'}),
          body:JSON.stringify(args)
        });
        return await parseResponse(r);
      }catch(e){return {data:null,error:{message:e.message||String(e)}}}
    }
  };
})();
const $=s=>document.querySelector(s);
const won=n=>new Intl.NumberFormat('ko-KR').format(Math.round(Number(n||0)))+'원';
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
let state={session:null,academy:null,accounts:[],tab:'home',install:null,month:new Date().toISOString().slice(0,7)};

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.install=e;render()});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js?v=8').catch(()=>{});

function shell(body){
  const nav=[['home','홈'],['tx','거래'],['add','입력'],['fs','재무제표'],['funds','자금'],['settings','설정']];
  return `<div class="wrap"><div class="top"><div><div class="brand">⬡ ${state.academy?.name||'Academy Finance'}</div><div class="muted">학원 재무를 한눈에</div></div><button class="btn" onclick="logout()">로그아웃</button></div>${body}</div><div class="nav"><div class="nav-inner">${nav.map(([k,v])=>`<button class="${state.tab===k?'on':''}" onclick="go('${k}')">${v}</button>`).join('')}</div></div>`
}
function authView(){return `<div class="auth"><span class="pill">ACADEMY FINANCE</span><h1>원장님을 위한<br>쉬운 재무제표</h1><p class="muted">이메일로 가입한 뒤 학원을 만들면 바로 시작할 수 있어요.</p><div class="card"><div class="field"><label>이메일</label><input id="email" type="email" placeholder="name@example.com"></div><div class="field"><label>비밀번호 (6자 이상)</label><input id="pw" type="password" minlength="6"></div><button class="btn primary" onclick="login()">로그인</button><button class="btn" style="width:100%;margin-top:8px" onclick="signup()">처음이에요 · 회원가입</button><p id="msg" class="muted"></p></div></div>`}
async function login(){const{error}=await sb.auth.signInWithPassword({email:$('#email').value,password:$('#pw').value});$('#msg').textContent=error?error.message:'로그인 중…'}
async function signup(){const{error}=await sb.auth.signUp({email:$('#email').value,password:$('#pw').value});$('#msg').textContent=error?error.message:'가입되었습니다. 바로 로그인해주세요.'}
async function logout(){await sb.auth.signOut();state.session=null;state.academy=null;render()}
async function loadAcademy(){const{data}=await sb.from('academy_members').select('academy_id,role,academies(id,name)').limit(1).maybeSingle();state.academy=data?.academies||null;if(state.academy){const r=await sb.from('accounts').select('*').eq('academy_id',state.academy.id).order('code');state.accounts=r.data||[]}}
function onboarding(){return `<div class="auth"><h1>학원을 등록해주세요</h1><div class="card"><div class="field"><label>학원 이름</label><input id="academyName" placeholder="예: 우리 학원"></div><button class="btn primary" onclick="createAcademy()">재무관리 시작하기</button><p id="msg" class="muted"></p></div></div>`}
async function createAcademy(){const name=$('#academyName').value.trim();if(!name)return;const{error}=await sb.rpc('create_academy',{p_name:name});if(error){$('#msg').textContent=error.message;return}await loadAcademy();render()}

function monthRange(){const [y,m]=state.month.split('-').map(Number);const s=`${y}-${String(m).padStart(2,'0')}-01`;const e=new Date(y,m,0).toISOString().slice(0,10);return[s,e]}
function monthTitle(){const[y,m]=state.month.split('-');return `${y}년 ${Number(m)}월`}
function monthBar(){return `<div class="monthbar"><button class="mini" onclick="shiftMonth(-1)">‹</button><input type="month" value="${state.month}" onchange="setMonth(this.value)"><button class="mini" onclick="shiftMonth(1)">›</button></div>`}
async function setMonth(v){if(v){state.month=v;await go(state.tab)}}
async function shiftMonth(delta){const[y,m]=state.month.split('-').map(Number);const d=new Date(y,m-1+delta,1);state.month=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;await go(state.tab)}
async function summary(){const[s,e]=monthRange();const{data,error}=await sb.rpc('financial_summary',{p_academy:state.academy.id,p_start:s,p_end:e});return error?{}:(data?.[0]||{})}
function txAmount(t){return Math.max(0,...(t.transaction_lines||[]).map(l=>Number(l.debit||l.credit||0)))}
function txKind(t){const ls=t.transaction_lines||[];if(ls.some(l=>l.accounts?.type==='revenue'))return '매출';if(ls.some(l=>l.accounts?.type==='expense'))return '비용';if(ls.some(l=>l.accounts?.type==='liability'))return '카드대금';return '자금이동'}
function txKindClass(t){const k=txKind(t);return k==='매출'?'blue':k==='비용'?'red':''}

async function home(){
  const x=await summary(),[s,e]=monthRange();
  const{data:tx}=await sb.from('transactions').select('id,transaction_date,description,evidence_name,transaction_lines(debit,credit,accounts(name,type))').eq('academy_id',state.academy.id).gte('transaction_date',s).lte('transaction_date',e).order('transaction_date',{ascending:false}).limit(5);
  const body=`${monthBar()}<div class="card hero"><div class="muted">${monthTitle()} 순이익</div><div class="big ${Number(x.net_income)>=0?'blue':'red'}">${won(x.net_income)}</div><div class="muted">매출 ${won(x.revenue)} · 비용 ${won(x.expense)}</div></div><div class="grid four"><div class="card metric"><span class="muted">매출</span><b class="blue">${won(x.revenue)}</b></div><div class="card metric"><span class="muted">비용</span><b class="red">${won(x.expense)}</b></div><div class="card metric"><span class="muted">자산</span><b>${won(x.assets)}</b></div><div class="card metric"><span class="muted">부채</span><b>${won(x.liabilities)}</b></div></div><div class="section-title">최근 거래</div><div class="card">${tx?.length?tx.map(t=>`<div class="row"><div><b>${esc(t.description)}</b><div class="muted">${t.transaction_date} · ${txKind(t)} ${t.evidence_name?'· 📎 증빙':''}</div></div><span class="amount ${txKindClass(t)}">${won(txAmount(t))}</span></div>`).join(''):'<div class="empty">아직 거래가 없어요.<br>아래 입력 메뉴에서 첫 거래를 기록해보세요.</div>'}</div>${state.install?'<button class="btn install" style="width:100%" onclick="installApp()">📲 홈 화면에 앱 설치하기</button>':''}`;
  $('#app').innerHTML=shell(body)
}

async function transactions(){
  const[s,e]=monthRange();
  const{data}=await sb.from('transactions').select('id,transaction_date,description,evidence_name,transaction_lines(account_id,debit,credit,accounts(id,name,type))').eq('academy_id',state.academy.id).gte('transaction_date',s).lte('transaction_date',e).order('transaction_date',{ascending:false}).limit(200);
  $('#app').innerHTML=shell(`${monthBar()}<div class="section-title">${monthTitle()} 거래 내역</div><div class="card">${data?.length?data.map(t=>`<button class="row txrow" onclick="transactionDetail('${t.id}')"><div><b>${esc(t.description)}</b><div class="muted">${t.transaction_date} · ${txKind(t)} ${t.evidence_name?'· 📎':''}</div></div><span class="amount ${txKindClass(t)}">${won(txAmount(t))}</span></button>`).join(''):'<div class="empty">거래가 없습니다.</div>'}</div><div class="notice">거래를 누르면 수정·삭제하고 증빙사진도 확인할 수 있습니다.</div>`)
}

function opts(list,selected){return list.map(a=>`<option value="${a.id}" ${a.id===selected?'selected':''}>${a.name}</option>`).join('')}
function byType(type){return state.accounts.filter(a=>a.type===type)}
function expenseCounterparts(){return state.accounts.filter(a=>a.type==='asset'||(a.type==='liability'&&a.code==='203'))}
async function transactionDetail(id){
  const{data:t,error}=await sb.from('transactions').select('id,transaction_date,description,evidence_name,evidence_data,transaction_lines(account_id,debit,credit,accounts(id,code,name,type))').eq('id',id).eq('academy_id',state.academy.id).maybeSingle();
  if(error||!t){alert(error?.message||'거래를 찾을 수 없습니다.');return}
  const ls=t.transaction_lines||[],rev=ls.find(l=>l.accounts?.type==='revenue'),exp=ls.find(l=>l.accounts?.type==='expense');
  let kind='transfer',cat=null,counter=null,to=null,from=null;
  if(rev){kind='income';cat=rev;counter=ls.find(l=>l!==rev)}
  else if(exp){kind='expense';cat=exp;counter=ls.find(l=>l!==exp)}
  else {
    const liab=ls.find(l=>l.accounts?.type==='liability');
    if(liab){kind='cardpay';cat=liab;counter=ls.find(l=>l.accounts?.type==='asset')}
    else {kind='transfer';to=ls.find(l=>Number(l.debit)>0);from=ls.find(l=>Number(l.credit)>0)}
  }
  const amt=txAmount(t);
  let fields='';
  if(kind==='income') fields=`<div class="field"><label>수익 계정</label><select id="editCategory">${opts(byType('revenue'),cat?.account_id)}</select></div><div class="field"><label>받은 곳</label><select id="editCounter">${opts(byType('asset'),counter?.account_id)}</select></div>`;
  else if(kind==='expense') fields=`<div class="field"><label>비용 계정</label><select id="editCategory">${opts(byType('expense'),cat?.account_id)}</select></div><div class="field"><label>결제 수단</label><select id="editCounter">${opts(expenseCounterparts(),counter?.account_id)}</select></div>`;
  else if(kind==='cardpay') fields=`<div class="field"><label>카드대금 계정</label><select id="editCategory">${opts(state.accounts.filter(a=>a.type==='liability'),cat?.account_id)}</select></div><div class="field"><label>출금 계좌</label><select id="editCounter">${opts(byType('asset'),counter?.account_id)}</select></div>`;
  else fields=`<div class="field"><label>보내는 곳</label><select id="editFrom">${opts(byType('asset'),from?.account_id)}</select></div><div class="field"><label>받는 곳</label><select id="editTo">${opts(byType('asset'),to?.account_id)}</select></div>`;
  const evidence=t.evidence_data?`<div class="evidence"><div class="muted">현재 증빙 · ${esc(t.evidence_name||'이미지')}</div><img src="${t.evidence_data}" alt="증빙"><button class="btn danger-lite" onclick="removeEvidence('${t.id}')">증빙 삭제</button></div>`:'';
  $('#app').innerHTML=shell(`<div class="section-title">거래 수정</div><div class="card"><div class="field"><label>날짜</label><input id="editDate" type="date" value="${t.transaction_date}"></div><div class="field"><label>내용</label><input id="editDesc" value="${esc(t.description)}"></div><div class="field"><label>금액</label><input id="editAmount" type="number" min="1" value="${amt}"></div>${fields}<div class="field"><label>증빙사진 ${t.evidence_data?'교체':'첨부'} (선택)</label><input id="editEvidence" type="file" accept="image/*"></div>${evidence}<button class="btn primary" onclick="updateTx('${t.id}','${kind}')">수정 저장</button><button class="btn danger-lite" onclick="deleteTx('${t.id}')">이 거래 삭제</button><button class="btn" style="width:100%;margin-top:10px" onclick="go('tx')">목록으로</button><p id="msg" class="muted"></p></div>`)
}
async function updateTx(id,kind){
  const amt=Number($('#editAmount').value),desc=$('#editDesc').value.trim();if(!amt||!desc){$('#msg').textContent='내용과 금액을 입력해주세요.';return}
  let lines=[];
  if(kind==='income'){lines=[{account_id:$('#editCounter').value,debit:amt,credit:0},{account_id:$('#editCategory').value,debit:0,credit:amt}]}
  else if(kind==='expense'){lines=[{account_id:$('#editCategory').value,debit:amt,credit:0},{account_id:$('#editCounter').value,debit:0,credit:amt}]}
  else if(kind==='cardpay'){lines=[{account_id:$('#editCategory').value,debit:amt,credit:0},{account_id:$('#editCounter').value,debit:0,credit:amt}]}
  else {if($('#editFrom').value===$('#editTo').value){$('#msg').textContent='보내는 곳과 받는 곳을 다르게 선택해주세요.';return}lines=[{account_id:$('#editTo').value,debit:amt,credit:0},{account_id:$('#editFrom').value,debit:0,credit:amt}]}
  $('#msg').textContent='수정 중…';
  const{error}=await sb.rpc('update_journal',{p_transaction:id,p_date:$('#editDate').value,p_description:desc,p_lines:lines});if(error){$('#msg').textContent=error.message;return}
  const ev=await compressEvidence('editEvidence');if(ev.error){$('#msg').textContent=ev.error;return}if(ev.data){const r=await sb.rpc('set_transaction_evidence',{p_transaction:id,p_name:ev.name,p_data:ev.data});if(r.error){$('#msg').textContent=r.error.message;return}}
  state.tab='tx';await transactions()
}
async function removeEvidence(id){if(!confirm('첨부한 증빙사진을 삭제할까요?'))return;const{error}=await sb.rpc('set_transaction_evidence',{p_transaction:id,p_name:null,p_data:null});if(error){alert(error.message);return}await transactionDetail(id)}
async function deleteTx(id){if(!confirm('이 거래를 삭제할까요? 삭제하면 재무제표에서도 즉시 빠집니다.'))return;const{error}=await sb.rpc('delete_journal',{p_transaction:id});if(error){alert(error.message);return}state.tab='tx';await transactions()}

function accountOptions(type){return state.accounts.filter(a=>!type||a.type===type).map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}
function counterOptions(kind){const arr=kind==='income'?byType('asset'):expenseCounterparts();return arr.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}
function addView(){const today=new Date().toISOString().slice(0,10);$('#app').innerHTML=shell(`<div class="section-title">새 거래</div><div class="card"><div class="tabs"><button id="incomeBtn" class="btn on" onclick="setKind('income')">돈이 들어왔어요</button><button id="expenseBtn" class="btn" onclick="setKind('expense')">돈을 썼어요</button></div><input id="kind" type="hidden" value="income"><div class="field"><label>날짜</label><input id="date" type="date" value="${today}"></div><div class="field"><label>내용</label><input id="desc" placeholder="예: 8월 학원 매출"></div><div class="field"><label>금액</label><input id="amount" type="number" min="1" inputmode="numeric" placeholder="0"></div><div class="field"><label id="catLabel">수익 계정</label><select id="category">${accountOptions('revenue')}</select></div><div class="field"><label id="counterLabel">받은 곳</label><select id="counter">${counterOptions('income')}</select><div id="quickMethods" class="chips"><button type="button" onclick="pickCounter('102')">계좌</button><button type="button" onclick="pickCounter('101')">현금</button><button type="button" onclick="pickCounter('103')">카드매출</button></div></div><div class="field"><label>증빙사진 (선택)</label><input id="evidence" type="file" accept="image/*" capture="environment"></div><button class="btn primary" onclick="saveTx()">저장하기</button><p id="msg" class="muted"></p></div><div class="notice">카드매출은 ‘카드매출’을 선택하면 카드미수금으로 잡히고, 자금 메뉴에서 실제 입금 처리할 수 있습니다.</div>`)}
function pickCounter(code){const a=state.accounts.find(x=>x.code===code);if(a&&$('#counter'))$('#counter').value=a.id}
function setKind(k){$('#kind').value=k;$('#incomeBtn').classList.toggle('on',k==='income');$('#expenseBtn').classList.toggle('on',k==='expense');$('#catLabel').textContent=k==='income'?'수익 계정':'비용 계정';$('#category').innerHTML=accountOptions(k==='income'?'revenue':'expense');$('#counterLabel').textContent=k==='income'?'받은 곳':'결제 수단';$('#counter').innerHTML=counterOptions(k);$('#quickMethods').innerHTML=k==='income'?`<button type="button" onclick="pickCounter('102')">계좌</button><button type="button" onclick="pickCounter('101')">현금</button><button type="button" onclick="pickCounter('103')">카드매출</button>`:`<button type="button" onclick="pickCounter('102')">계좌</button><button type="button" onclick="pickCounter('101')">현금</button><button type="button" onclick="pickCounter('203')">신용카드</button>`}
async function compressEvidence(id){const input=$('#'+id);const file=input?.files?.[0];if(!file)return {data:null,name:null};if(!file.type.startsWith('image/'))return {error:'이미지 파일만 첨부할 수 있습니다.'};try{const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=window.URL.createObjectURL(file)});const max=1200,scale=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);let data=c.toDataURL('image/jpeg',0.72);if(data.length>1900000)data=c.toDataURL('image/jpeg',0.5);if(data.length>2000000)return {error:'사진 용량이 너무 큽니다. 더 작은 사진을 선택해주세요.'};return {data,name:file.name.replace(/[^0-9A-Za-z가-힣._-]/g,'_')}}catch(e){return {error:'사진을 읽지 못했습니다.'}}}
async function saveTx(){const k=$('#kind').value,amt=Number($('#amount').value),cat=$('#category').value,counter=$('#counter').value;if(!amt||!$('#desc').value.trim()){$('#msg').textContent='내용과 금액을 입력해주세요.';return}const counterAcc=state.accounts.find(a=>a.id===counter);let lines;if(k==='income')lines=[{account_id:counter,debit:amt,credit:0},{account_id:cat,debit:0,credit:amt}];else lines=[{account_id:cat,debit:amt,credit:0},{account_id:counter,debit:0,credit:amt}];$('#msg').textContent='저장 중…';const{data,error}=await sb.rpc('post_journal',{p_academy:state.academy.id,p_date:$('#date').value,p_description:$('#desc').value,p_lines:lines});if(error){$('#msg').textContent=error.message;return}const txId=typeof data==='string'?data:(Array.isArray(data)?data[0]:data);const ev=await compressEvidence('evidence');if(ev.error){$('#msg').textContent='거래는 저장됐지만 '+ev.error;return}if(ev.data&&txId){const r=await sb.rpc('set_transaction_evidence',{p_transaction:txId,p_name:ev.name,p_data:ev.data});if(r.error){$('#msg').textContent='거래는 저장됐지만 증빙 첨부 실패: '+r.error.message;return}}state.tab='home';state.month=$('#date').value.slice(0,7);await home()}

async function statements(){const x=await summary();const[s,e]=monthRange();const{data:lines}=await sb.from('transaction_lines').select('debit,credit,accounts(name,type),transactions!inner(academy_id,transaction_date)').eq('transactions.academy_id',state.academy.id).gte('transactions.transaction_date',s).lte('transactions.transaction_date',e);const groups={revenue:{},expense:{}};(lines||[]).forEach(l=>{const t=l.accounts?.type;if(!groups[t])return;const n=l.accounts.name;groups[t][n]=(groups[t][n]||0)+(t==='revenue'?Number(l.credit)-Number(l.debit):Number(l.debit)-Number(l.credit))});const rows=o=>Object.entries(o).map(([n,v])=>`<div class="row"><span>${n}</span><b>${won(v)}</b></div>`).join('')||'<div class="muted">내역 없음</div>';const displayedEquity=Number(x.equity||0)+Number(x.net_income||0);$('#app').innerHTML=shell(`${monthBar()}<div class="section-title">${monthTitle()} 손익계산서</div><div class="card statement"><h3>수익</h3>${rows(groups.revenue)}<div class="row"><b>수익 합계</b><b class="blue">${won(x.revenue)}</b></div></div><div class="card statement"><h3>비용</h3>${rows(groups.expense)}<div class="row"><b>비용 합계</b><b class="red">${won(x.expense)}</b></div></div><div class="card hero"><div class="muted">당기순이익</div><div class="big">${won(x.net_income)}</div></div><div class="section-title">${monthTitle()} 말 재무상태 요약</div><div class="card"><div class="row"><span>자산</span><b>${won(x.assets)}</b></div><div class="row"><span>부채</span><b>${won(x.liabilities)}</b></div><div class="row"><span>자본 (당기순이익 포함)</span><b>${won(displayedEquity)}</b></div><div class="row"><span>부채 + 자본</span><b>${won(Number(x.liabilities||0)+displayedEquity)}</b></div></div>`)}

async function balances(){const[,e]=monthRange();const{data:lines,error}=await sb.from('transaction_lines').select('debit,credit,accounts(id,code,name,type),transactions!inner(academy_id,transaction_date)').eq('transactions.academy_id',state.academy.id).lte('transactions.transaction_date',e);if(error)return {};const b={};(lines||[]).forEach(l=>{const a=l.accounts;if(!a)return;const sign=a.type==='liability'||a.type==='equity'||a.type==='revenue'?Number(l.credit)-Number(l.debit):Number(l.debit)-Number(l.credit);b[a.id]=(b[a.id]||0)+sign});return b}
function accByCode(code){return state.accounts.find(a=>a.code===code)}
async function funds(){const b=await balances();const key=['101','102','103','203'].map(accByCode).filter(Boolean);$('#app').innerHTML=shell(`${monthBar()}<div class="section-title">${monthTitle()} 말 자금 현황</div><div class="grid two">${key.map(a=>`<div class="card metric"><span class="muted">${a.name}</span><b class="${a.code==='203'?'red':''}">${won(b[a.id]||0)}</b></div>`).join('')}</div><div class="section-title">카드·자금 처리</div><div class="card action-list"><button class="action" onclick="fundAction('cardDeposit')"><b>카드매출 입금</b><span class="muted">카드미수금 → 보통예금</span></button><button class="action" onclick="fundAction('cardPay')"><b>카드대금 결제</b><span class="muted">보통예금 → 카드미지급금</span></button><button class="action" onclick="fundAction('transfer')"><b>현금·계좌 자금이동</b><span class="muted">자산 계정끼리 이동</span></button></div><div class="notice">카드로 매출을 받으면 카드미수금이 늘고, 실제 카드사 입금일에 ‘카드매출 입금’을 기록하세요.</div>`)}
function fundAction(type){const today=new Date().toISOString().slice(0,10),assets=byType('asset');let title='',desc='',fields='';if(type==='cardDeposit'){title='카드매출 입금';desc='카드매출 정산 입금';fields=`<div class="field"><label>입금 계좌</label><select id="fundTo">${opts(assets,accByCode('102')?.id)}</select></div>`}else if(type==='cardPay'){title='카드대금 결제';desc='신용카드 대금 결제';fields=`<div class="field"><label>출금 계좌</label><select id="fundFrom">${opts(assets,accByCode('102')?.id)}</select></div>`}else{title='현금·계좌 자금이동';desc='자금 이동';fields=`<div class="field"><label>보내는 곳</label><select id="fundFrom">${opts(assets,accByCode('101')?.id)}</select></div><div class="field"><label>받는 곳</label><select id="fundTo">${opts(assets,accByCode('102')?.id)}</select></div>`}$('#app').innerHTML=shell(`<div class="section-title">${title}</div><div class="card"><div class="field"><label>날짜</label><input id="fundDate" type="date" value="${today}"></div><div class="field"><label>내용</label><input id="fundDesc" value="${desc}"></div><div class="field"><label>금액</label><input id="fundAmount" type="number" min="1" placeholder="0"></div>${fields}<button class="btn primary" onclick="saveFund('${type}')">저장하기</button><button class="btn" style="width:100%;margin-top:10px" onclick="go('funds')">취소</button><p id="msg" class="muted"></p></div>`)}
async function saveFund(type){const amt=Number($('#fundAmount').value),desc=$('#fundDesc').value.trim();if(!amt||!desc){$('#msg').textContent='내용과 금액을 입력해주세요.';return}let lines=[];if(type==='cardDeposit'){const card=accByCode('103');lines=[{account_id:$('#fundTo').value,debit:amt,credit:0},{account_id:card.id,debit:0,credit:amt}]}else if(type==='cardPay'){const payable=accByCode('203');lines=[{account_id:payable.id,debit:amt,credit:0},{account_id:$('#fundFrom').value,debit:0,credit:amt}]}else{if($('#fundFrom').value===$('#fundTo').value){$('#msg').textContent='보내는 곳과 받는 곳을 다르게 선택해주세요.';return}lines=[{account_id:$('#fundTo').value,debit:amt,credit:0},{account_id:$('#fundFrom').value,debit:0,credit:amt}]}const{error}=await sb.rpc('post_journal',{p_academy:state.academy.id,p_date:$('#fundDate').value,p_description:desc,p_lines:lines});if(error){$('#msg').textContent=error.message;return}state.month=$('#fundDate').value.slice(0,7);state.tab='funds';await funds()}

function settings(){const email=state.session.user.email;$('#app').innerHTML=shell(`<div class="section-title">설정</div><div class="card"><div class="row"><span>학원</span><b>${state.academy.name}</b></div><div class="row"><span>로그인</span><b>${email}</b></div><div class="row"><span>통화</span><b>KRW (원)</b></div><div class="row"><span>버전</span><b>v8</b></div></div><div class="card"><h3>기본 계정과목</h3>${state.accounts.map(a=>`<div class="row"><span>${a.code} · ${a.name}</span><span class="muted">${a.type}</span></div>`).join('')}</div><div class="notice">증빙사진은 현재 MVP 방식으로 압축해 거래에 저장합니다. 대량 사용 전에는 전용 파일 저장소로 이전하는 것을 권장합니다.</div><div class="notice">이 앱은 경영관리용입니다. 세무 신고·외부감사 목적의 공식 재무제표는 세무/회계 전문가의 검토가 필요합니다.</div>`)}
async function installApp(){if(state.install){await state.install.prompt();state.install=null}}
async function go(t){state.tab=t;if(t==='home')await home();else if(t==='tx')await transactions();else if(t==='add')addView();else if(t==='fs')await statements();else if(t==='funds')await funds();else settings()}
async function render(){if(!state.session){$('#app').innerHTML=authView();return}if(!state.academy){$('#app').innerHTML=onboarding();return}await go(state.tab)}

window.addEventListener('error', e => {console.error('Academy Finance error:',e.error||e.message);const app=document.querySelector('#app');if(app&&app.textContent.includes('앱을 불러오는 중'))app.innerHTML=`<div class="auth"><h1>앱 실행 오류</h1><div class="card"><p class="muted">${String(e.message||'알 수 없는 오류')}</p><button class="btn primary" onclick="location.reload()">다시 불러오기</button></div></div>`});
window.addEventListener('unhandledrejection',e=>console.error('Academy Finance promise error:',e.reason));
async function restoreSession(){try{if(!state.session)render();const result=await Promise.race([sb.auth.getSession(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('로그인 상태 확인 시간이 초과되었습니다.')),8000))]);state.session=result?.data?.session||null;if(state.session)await loadAcademy();await render()}catch(err){console.error(err);state.session=null;document.querySelector('#app').innerHTML=authView()+`<div style="max-width:520px;margin:12px auto;padding:0 16px"><div class="notice">연결 확인 중 문제가 있었습니다: ${String(err.message||err)}</div></div>`}}
sb.auth.onAuthStateChange((_,session)=>{setTimeout(async()=>{try{state.session=session;state.academy=null;state.accounts=[];if(session)await loadAcademy();await render()}catch(err){console.error('auth state render error',err)}},0)});
render();restoreSession();
