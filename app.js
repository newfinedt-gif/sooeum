const URL='https://senrhkdnsrpcnjvigzfq.supabase.co';
const KEY='sb_publishable_uvOL2lGthR-PNI9tlNoBjA_-8ieB4qx';

// Academy Finance v5: 외부 Supabase JS CDN 없이 REST/Auth API를 직접 사용합니다.
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
      const out=await authRequest('signup',{email,password});
      if(out.error)return out;
      const d=out.data||{};
      let s=null;
      if(d.access_token){
        s={access_token:d.access_token,refresh_token:d.refresh_token,expires_in:d.expires_in,token_type:d.token_type||'bearer',user:d.user};
        saveStored(s); emit('SIGNED_IN',s);
      }
      return {data:{session:s,user:d.user||d},error:null};
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
const $=s=>document.querySelector(s);const won=n=>new Intl.NumberFormat('ko-KR').format(Math.round(Number(n||0)))+'원';let state={session:null,academy:null,accounts:[],tab:'home',install:null};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.install=e;render()});if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js');
function shell(body){return `<div class="wrap"><div class="top"><div><div class="brand">⬡ ${state.academy?.name||'Academy Finance'}</div><div class="muted">학원 재무를 한눈에</div></div><button class="btn" onclick="logout()">로그아웃</button></div>${body}</div><div class="nav"><div class="nav-inner">${[['home','홈'],['tx','거래'],['add','입력'],['fs','재무제표'],['settings','설정']].map(([k,v])=>`<button class="${state.tab===k?'on':''}" onclick="go('${k}')">${v}</button>`).join('')}</div></div>`}
function authView(){return `<div class="auth"><span class="pill">ACADEMY FINANCE</span><h1>원장님을 위한<br>쉬운 재무제표</h1><p class="muted">이메일로 가입한 뒤 학원을 만들면 바로 시작할 수 있어요.</p><div class="card"><div class="field"><label>이메일</label><input id="email" type="email" placeholder="name@example.com"></div><div class="field"><label>비밀번호 (6자 이상)</label><input id="pw" type="password" minlength="6"></div><button class="btn primary" onclick="login()">로그인</button><button class="btn" style="width:100%;margin-top:8px" onclick="signup()">처음이에요 · 회원가입</button><p id="msg" class="muted"></p></div></div>`}
async function login(){const{error}=await sb.auth.signInWithPassword({email:$('#email').value,password:$('#pw').value});$('#msg').textContent=error?error.message:'로그인 중…'}async function signup(){const{error}=await sb.auth.signUp({email:$('#email').value,password:$('#pw').value});$('#msg').textContent=error?error.message:'가입되었습니다. 이메일 확인이 필요한 경우 메일을 확인한 뒤 로그인해주세요.'}async function logout(){await sb.auth.signOut();state.session=null;state.academy=null;render()}
async function loadAcademy(){const{data}=await sb.from('academy_members').select('academy_id,role,academies(id,name)').limit(1).maybeSingle();state.academy=data?.academies||null;if(state.academy){const r=await sb.from('accounts').select('*').eq('academy_id',state.academy.id).order('code');state.accounts=r.data||[]}}
function onboarding(){return `<div class="auth"><h1>학원을 등록해주세요</h1><div class="card"><div class="field"><label>학원 이름</label><input id="academyName" placeholder="예: 우리 학원"></div><button class="btn primary" onclick="createAcademy()">재무관리 시작하기</button><p id="msg" class="muted"></p></div></div>`}async function createAcademy(){const name=$('#academyName').value.trim();if(!name)return;const{error}=await sb.rpc('create_academy',{p_name:name});if(error){$('#msg').textContent=error.message;return}await loadAcademy();render()}
function monthRange(){const d=new Date();const s=new Date(d.getFullYear(),d.getMonth(),1);const e=new Date(d.getFullYear(),d.getMonth()+1,0);return [s.toISOString().slice(0,10),e.toISOString().slice(0,10)]}
async function summary(){const[s,e]=monthRange();const{data,error}=await sb.rpc('financial_summary',{p_academy:state.academy.id,p_start:s,p_end:e});return error?{}:(data?.[0]||{})}
async function home(){const x=await summary();const{data:tx}=await sb.from('transactions').select('id,transaction_date,description,transaction_lines(debit,credit,accounts(name,type))').eq('academy_id',state.academy.id).order('transaction_date',{ascending:false}).limit(5);const body=`<div class="card hero"><div class="muted">이번 달 순이익</div><div class="big ${Number(x.net_income)>=0?'blue':'red'}">${won(x.net_income)}</div><div class="muted">매출 ${won(x.revenue)} · 비용 ${won(x.expense)}</div></div><div class="grid four"><div class="card metric"><span class="muted">매출</span><b class="blue">${won(x.revenue)}</b></div><div class="card metric"><span class="muted">비용</span><b class="red">${won(x.expense)}</b></div><div class="card metric"><span class="muted">자산</span><b>${won(x.assets)}</b></div><div class="card metric"><span class="muted">부채</span><b>${won(x.liabilities)}</b></div></div><div class="section-title">최근 거래</div><div class="card">${tx?.length?tx.map(t=>`<div class="row"><div><b>${t.description}</b><div class="muted">${t.transaction_date}</div></div><span class="amount">${won(Math.max(...t.transaction_lines.map(l=>Number(l.debit||l.credit))))}</span></div>`).join(''):'<div class="empty">아직 거래가 없어요.<br>아래 입력 메뉴에서 첫 거래를 기록해보세요.</div>'}</div>${state.install?'<button class="btn install" style="width:100%" onclick="installApp()">📲 홈 화면에 앱 설치하기</button>':''}`;$('#app').innerHTML=shell(body)}
async function transactions(){const{data}=await sb.from('transactions').select('id,transaction_date,description,transaction_lines(debit,credit,accounts(name,type))').eq('academy_id',state.academy.id).order('transaction_date',{ascending:false}).limit(100);$('#app').innerHTML=shell(`<div class="section-title">거래 내역</div><div class="card">${data?.length?data.map(t=>`<div class="row"><div><b>${t.description}</b><div class="muted">${t.transaction_date} · ${t.transaction_lines.map(l=>l.accounts?.name).join(' / ')}</div></div><span class="amount">${won(Math.max(...t.transaction_lines.map(l=>Number(l.debit||l.credit))))}</span></div>`).join(''):'<div class="empty">거래가 없습니다.</div>'}</div>`)}
function accountOptions(type){return state.accounts.filter(a=>!type||a.type===type).map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}
function addView(){const today=new Date().toISOString().slice(0,10);$('#app').innerHTML=shell(`<div class="section-title">새 거래</div><div class="card"><div class="tabs"><button id="incomeBtn" class="btn on" onclick="setKind('income')">돈이 들어왔어요</button><button id="expenseBtn" class="btn" onclick="setKind('expense')">돈을 썼어요</button></div><input id="kind" type="hidden" value="income"><div class="field"><label>날짜</label><input id="date" type="date" value="${today}"></div><div class="field"><label>내용</label><input id="desc" placeholder="예: 8월 학원 매출"></div><div class="field"><label>금액</label><input id="amount" type="number" min="1" inputmode="numeric" placeholder="0"></div><div class="field"><label id="catLabel">수익 계정</label><select id="category">${accountOptions('revenue')}</select></div><div class="field"><label>입출금 계정</label><select id="cash">${accountOptions('asset')}</select></div><button class="btn primary" onclick="saveTx()">저장하기</button><p id="msg" class="muted"></p></div><div class="notice">저장 시 앱이 차변·대변을 자동으로 맞춰 복식부기로 기록합니다.</div>`)}
function setKind(k){$('#kind').value=k;$('#incomeBtn').classList.toggle('on',k==='income');$('#expenseBtn').classList.toggle('on',k==='expense');$('#catLabel').textContent=k==='income'?'수익 계정':'비용 계정';$('#category').innerHTML=accountOptions(k==='income'?'revenue':'expense')}
async function saveTx(){const k=$('#kind').value,amt=Number($('#amount').value),cat=$('#category').value,cash=$('#cash').value;if(!amt||!$('#desc').value.trim()){$('#msg').textContent='내용과 금액을 입력해주세요.';return}const lines=k==='income'?[{account_id:cash,debit:amt,credit:0},{account_id:cat,debit:0,credit:amt}]:[{account_id:cat,debit:amt,credit:0},{account_id:cash,debit:0,credit:amt}];const{error}=await sb.rpc('post_journal',{p_academy:state.academy.id,p_date:$('#date').value,p_description:$('#desc').value,p_lines:lines});if(error){$('#msg').textContent=error.message;return}state.tab='home';await home()}
async function statements(){const x=await summary();const[s,e]=monthRange();const{data:lines}=await sb.from('transaction_lines').select('debit,credit,accounts(name,type),transactions!inner(academy_id,transaction_date)').eq('transactions.academy_id',state.academy.id).gte('transactions.transaction_date',s).lte('transactions.transaction_date',e);const groups={revenue:{},expense:{}};(lines||[]).forEach(l=>{const t=l.accounts?.type;if(!groups[t])return;const n=l.accounts.name;groups[t][n]=(groups[t][n]||0)+(t==='revenue'?Number(l.credit)-Number(l.debit):Number(l.debit)-Number(l.credit))});const rows=o=>Object.entries(o).map(([n,v])=>`<div class="row"><span>${n}</span><b>${won(v)}</b></div>`).join('')||'<div class="muted">내역 없음</div>';$('#app').innerHTML=shell(`<div class="section-title">손익계산서</div><div class="card statement"><h3>수익</h3>${rows(groups.revenue)}<div class="row"><b>수익 합계</b><b class="blue">${won(x.revenue)}</b></div></div><div class="card statement"><h3>비용</h3>${rows(groups.expense)}<div class="row"><b>비용 합계</b><b class="red">${won(x.expense)}</b></div></div><div class="card hero"><div class="muted">당기순이익</div><div class="big">${won(x.net_income)}</div></div><div class="section-title">재무상태 요약</div><div class="card"><div class="row"><span>자산</span><b>${won(x.assets)}</b></div><div class="row"><span>부채</span><b>${won(x.liabilities)}</b></div><div class="row"><span>자본(직접 기록)</span><b>${won(x.equity)}</b></div></div>`)}
function settings(){const email=state.session.user.email;$('#app').innerHTML=shell(`<div class="section-title">설정</div><div class="card"><div class="row"><span>학원</span><b>${state.academy.name}</b></div><div class="row"><span>로그인</span><b>${email}</b></div><div class="row"><span>통화</span><b>KRW (원)</b></div></div><div class="card"><h3>기본 계정과목</h3>${state.accounts.map(a=>`<div class="row"><span>${a.code} · ${a.name}</span><span class="muted">${a.type}</span></div>`).join('')}</div><div class="notice">이 앱은 경영관리용입니다. 세무 신고·외부감사 목적의 공식 재무제표는 세무/회계 전문가의 검토가 필요합니다.</div>`)}
async function installApp(){if(state.install){await state.install.prompt();state.install=null}}async function go(t){state.tab=t;if(t==='home')await home();else if(t==='tx')await transactions();else if(t==='add')addView();else if(t==='fs')await statements();else settings()}
async function render(){if(!state.session){$('#app').innerHTML=authView();return}if(!state.academy){$('#app').innerHTML=onboarding();return}await go(state.tab)}

// v4 안정화: 먼저 화면을 즉시 표시하고, 인증 복원은 뒤에서 처리합니다.
window.addEventListener('error', e => {
  console.error('Academy Finance error:', e.error || e.message);
  const app = document.querySelector('#app');
  if (app && app.textContent.includes('앱을 불러오는 중')) {
    app.innerHTML = `<div class="auth"><h1>앱 실행 오류</h1><div class="card"><p class="muted">${String(e.message || '알 수 없는 오류')}</p><button class="btn primary" onclick="location.reload()">다시 불러오기</button></div></div>`;
  }
});

window.addEventListener('unhandledrejection', e => {
  console.error('Academy Finance promise error:', e.reason);
});

async function restoreSession(){
  try{
    // 로그아웃 상태에서도 첫 화면이 즉시 보이게 함
    if(!state.session) render();

    const result = await Promise.race([
      sb.auth.getSession(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('로그인 상태 확인 시간이 초과되었습니다.')), 8000))
    ]);

    const session = result?.data?.session || null;
    state.session = session;

    if(session){
      await loadAcademy();
    }
    await render();
  }catch(err){
    console.error(err);
    state.session = null;
    document.querySelector('#app').innerHTML =
      authView() +
      `<div style="max-width:520px;margin:12px auto;padding:0 16px"><div class="notice">연결 확인 중 문제가 있었습니다: ${String(err.message || err)}</div></div>`;
  }
}

// auth 콜백 안에서 Supabase 쿼리를 직접 await하지 않아 교착 가능성을 피함
sb.auth.onAuthStateChange((_, session) => {
  setTimeout(async () => {
    try{
      state.session = session;
      state.academy = null;
      state.accounts = [];
      if(session) await loadAcademy();
      await render();
    }catch(err){
      console.error('auth state render error', err);
    }
  }, 0);
});

render();
restoreSession();

