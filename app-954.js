const URL='https://senrhkdnsrpcnjvigzfq.supabase.co';
const KEY='sb_publishable_uvOL2lGthR-PNI9tlNoBjA_-8ieB4qx';

// Academy Finance v9: 외부 Supabase JS CDN 없이 REST/Auth API를 직접 사용합니다.
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
  let refreshPromise=null;
  async function refreshSession(){
    if(!session?.refresh_token)return {data:null,error:{message:'로그인 정보가 만료되었습니다.'}};
    if(refreshPromise)return refreshPromise;
    refreshPromise=(async()=>{
      try{
        const r=await fetch(URL+'/auth/v1/token?grant_type=refresh_token',{
          method:'POST',
          headers:{'apikey':KEY,'Content-Type':'application/json'},
          body:JSON.stringify({refresh_token:session.refresh_token})
        });
        const out=await parseResponse(r);
        if(out.error){saveStored(null);emit('SIGNED_OUT',null);return out}
        const d=out.data||{};
        const s={
          access_token:d.access_token,
          refresh_token:d.refresh_token||session.refresh_token,
          expires_in:d.expires_in,
          token_type:d.token_type||'bearer',
          user:d.user||session.user,
          expires_at:Math.floor(Date.now()/1000)+Number(d.expires_in||3600)
        };
        saveStored(s); emit('TOKEN_REFRESHED',s);
        return {data:{session:s},error:null};
      }catch(e){return {data:null,error:{message:e.message||String(e)}}}
      finally{refreshPromise=null}
    })();
    return refreshPromise;
  }
  async function ensureFreshSession(){
    if(!session?.access_token)return {error:null};
    const exp=Number(session.expires_at||0);
    if(!exp || exp-Math.floor(Date.now()/1000)<90)return await refreshSession();
    return {error:null};
  }
  async function apiFetch(url,options={}){
    await ensureFreshSession();
    options.headers={...(options.headers||{}),...headers(options.headers||{})};
    let r=await fetch(url,options);
    if(r.status===401 && session?.refresh_token){
      const rr=await refreshSession();
      if(!rr.error){
        options.headers={...(options.headers||{}),...headers(options.headers||{})};
        r=await fetch(url,options);
      }
    }
    return r;
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
        const r=await apiFetch(URL+'/rest/v1/'+encodeURIComponent(this.table)+'?'+this.params.toString(),{
          headers:{'Accept':'application/json'}
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
        user:d.user,
        expires_at:Math.floor(Date.now()/1000)+Number(d.expires_in||3600)
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
            user:d.user,
            expires_at:Math.floor(Date.now()/1000)+Number(d.expires_in||3600)
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
      if(session?.access_token){
        const r=await ensureFreshSession();
        if(r?.error)session=null;
      }
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
        const r=await apiFetch(URL+'/rest/v1/rpc/'+encodeURIComponent(name),{
          method:'POST',
          headers:{'Prefer':'return=representation'},
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
const localDateISO=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const localMonthISO=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
let state={session:null,academy:null,accounts:[],tab:'home',install:null,month:localMonthISO(),monthTimer:null};

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.install=e;render()});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw-947.js').catch(()=>{});

function shell(body){
  const nav=[['home','⌂','홈'],['tx','⇄','거래'],['add','＋','입력'],['fs','▤','재무제표'],['funds','▣','자금'],['report','▧','보고서'],['settings','⚙','설정']];
  const side=nav.map(([k,ic,v])=>`<button class="side-link ${(state.tab===k||(state.tab==='card'&&k==='funds'))?'on':''}" onclick="go('${k}')"><span>${ic}</span>${v}</button>`).join('');
  const bottom=nav.map(([k,ic,v])=>`<button class="${(state.tab===k||(state.tab==='card'&&k==='funds'))?'on':''}" onclick="go('${k}')"><span>${ic}</span>${v}</button>`).join('');
  return `<div class="app-shell"><aside class="sidebar"><div class="logo-box"><img src="./logo-transparent.png?v=954" alt="수이음 로고"><div class="side-academy">${esc(state.academy?.name||'수이음학원')}</div><div class="side-sub">학원 재무를 한눈에</div></div><nav class="side-nav">${side}</nav><button class="side-logout" onclick="logout()">↪ 로그아웃</button></aside><main class="main"><div class="top"><div class="mobile-brand"><img src="./logo-transparent.png?v=954" alt="수이음"><div><div class="brand">${esc(state.academy?.name||'수이음학원')}</div><div class="muted">학원 재무를 한눈에</div></div></div><button class="btn logout" onclick="logout()">로그아웃</button></div><div class="wrap">${body}</div></main></div><div class="nav"><div class="nav-inner">${bottom}</div></div>`
}
function authView(){return `<div class="auth"><span class="pill">ACADEMY FINANCE</span><h1>원장님을 위한<br>쉬운 재무제표</h1><p class="muted">이메일로 가입한 뒤 학원을 만들면 바로 시작할 수 있어요.</p><div class="card"><div class="field"><label>이메일</label><input id="email" type="email" placeholder="name@example.com"></div><div class="field"><label>비밀번호 (6자 이상)</label><input id="pw" type="password" minlength="6"></div><button class="btn primary" onclick="login()">로그인</button><button class="btn" style="width:100%;margin-top:8px" onclick="signup()">처음이에요 · 회원가입</button><p id="msg" class="muted"></p></div></div>`}
async function login(){const{error}=await sb.auth.signInWithPassword({email:$('#email').value,password:$('#pw').value});$('#msg').textContent=error?error.message:'로그인 중…'}
async function signup(){const{error}=await sb.auth.signUp({email:$('#email').value,password:$('#pw').value});$('#msg').textContent=error?error.message:'가입되었습니다. 바로 로그인해주세요.'}
async function logout(){await sb.auth.signOut();state.session=null;state.academy=null;render()}
async function loadAcademy(){const{data}=await sb.from('academy_members').select('academy_id,role,academies(id,name)').limit(1).maybeSingle();state.academy=data?.academies||null;if(state.academy){const r=await sb.from('accounts').select('*').eq('academy_id',state.academy.id).order('code');state.accounts=r.data||[]}}
function onboarding(){return `<div class="auth"><h1>학원을 등록해주세요</h1><div class="card"><div class="field"><label>학원 이름</label><input id="academyName" placeholder="예: 우리 학원"></div><button class="btn primary" onclick="createAcademy()">재무관리 시작하기</button><p id="msg" class="muted"></p></div></div>`}
async function createAcademy(){const name=$('#academyName').value.trim();if(!name)return;const{error}=await sb.rpc('create_academy',{p_name:name});if(error){$('#msg').textContent=error.message;return}await loadAcademy();render()}

function monthRange(){const [y,m]=state.month.split('-').map(Number);const last=new Date(y,m,0).getDate();return [`${y}-${String(m).padStart(2,'0')}-01`,`${y}-${String(m).padStart(2,'0')}-${String(last).padStart(2,'0')}`]}
function monthTitle(){const[y,m]=state.month.split('-');return `${y}년 ${Number(m)}월`}
function monthBar(){return `<div class="monthbar"><button class="mini" onclick="shiftMonth(-1)">‹</button><input type="month" value="${state.month}" onchange="setMonth(this.value)"><button class="mini" onclick="shiftMonth(1)">›</button></div>`}
function scheduleMonthRender(){if(state.monthTimer)clearTimeout(state.monthTimer);state.monthTimer=setTimeout(()=>{state.monthTimer=null;go(state.tab)},120)}
function setMonth(v){if(v){state.month=v;scheduleMonthRender()}}
function shiftMonth(delta){const[y,m]=state.month.split('-').map(Number);const d=new Date(y,m-1+delta,1);state.month=localMonthISO(d);scheduleMonthRender()}
async function summary(){const[s,e]=monthRange();const{data,error}=await sb.rpc('financial_summary',{p_academy:state.academy.id,p_start:s,p_end:e});return error?{}:(data?.[0]||{})}
function txAmount(t){return Math.max(0,...(t.transaction_lines||[]).map(l=>Number(l.debit||l.credit||0)))}
function txKind(t){const ls=t.transaction_lines||[];if(ls.some(l=>l.accounts?.type==='revenue'))return '매출';if(ls.some(l=>l.accounts?.type==='expense'))return '비용';if(ls.some(l=>l.accounts?.type==='liability'))return '카드대금';return '자금이동'}
function txKindClass(t){const k=txKind(t);return k==='매출'?'blue':k==='비용'?'red':''}
function categoryBars(items){
  const max=Math.max(1,...items.map(x=>Number(x.value||0)));
  return items.length?`<div class="category-bars">${items.map((x,i)=>`<div class="cat-row"><div class="cat-label"><span>${esc(x.name)}</span><b>${won(x.value)}</b></div><div class="cat-track"><i style="width:${Math.max(3,Number(x.value||0)/max*100)}%"></i></div></div>`).join('')}</div>`:'<div class="empty compact">해당 월의 비용이 없습니다.</div>';
}
function expenseCategoryData(lines){const m={};(lines||[]).forEach(l=>{if(l.accounts?.type!=='expense')return;const n=l.accounts.name;m[n]=(m[n]||0)+Number(l.debit||0)-Number(l.credit||0)});return Object.entries(m).map(([name,value])=>({name,value})).filter(x=>x.value!==0).sort((a,b)=>b.value-a.value)}

async function recentSummaries(count=6){
  const cur=state.month, arr=[];
  for(let i=count-1;i>=0;i--){
    const[y,m]=cur.split('-').map(Number),d=new Date(y,m-1-i,1),mm=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    state.month=mm; const x=await summary(); arr.push({month:mm,label:`${d.getMonth()+1}월`,...x});
  }
  state.month=cur; return arr;
}
function trendSvg(data){
  const series=data.flatMap(d=>[Number(d.revenue||0),Number(d.expense||0),Number(d.net_income||0)]),max=Math.max(1,...series.map(Math.abs)),W=680,H=240,pL=62,pR=24,pT=18,pB=34,mid=H-pB;
  const y=v=>mid-(Number(v||0)/max)*(H-pT-pB);
  const x=i=>pL+i*(W-pL-pR)/Math.max(1,data.length-1);
  const pts=key=>data.map((d,i)=>`${x(i)},${y(d[key])}`).join(' ');
  const grid=[0,.25,.5,.75,1].map(r=>{const yy=mid-r*(H-pT-pB);const val=Math.round(max*r);return `<g><line class="gridline" x1="${pL}" y1="${yy}" x2="${W-pR}" y2="${yy}"/><text class="ylabel" x="${pL-8}" y="${yy+4}" text-anchor="end">${new Intl.NumberFormat('ko-KR').format(val)}</text></g>`}).join('');
  const labels=data.map((d,i)=>`<text x="${x(i)}" y="${H-8}" text-anchor="middle">${d.label}</text>`).join('');
  return `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="월별 손익 추이">${grid}<line x1="${pL}" y1="${mid}" x2="${W-pR}" y2="${mid}"/><polyline class="rev" points="${pts('revenue')}"/><polyline class="exp" points="${pts('expense')}"/><polyline class="net" points="${pts('net_income')}"/>${labels}</svg>`;
}
async function home(){
  const x=await summary(),[s,e]=monthRange();
  const[{data:tx},hist,b,{data:monthLines}]=await Promise.all([
    sb.from('transactions').select('id,transaction_date,description,counterparty,memo,transaction_lines(debit,credit,accounts(name,type))').eq('academy_id',state.academy.id).gte('transaction_date',s).lte('transaction_date',e).order('transaction_date',{ascending:false}).limit(8),
    recentSummaries(6),balances(),
    sb.from('transaction_lines').select('debit,credit,accounts(name,type),transactions!inner(academy_id,transaction_date)').eq('transactions.academy_id',state.academy.id).gte('transactions.transaction_date',s).lte('transactions.transaction_date',e)
  ]);
  const normalTx=(tx||[]).filter(t=>t.description!=='초기잔액 설정'), total=normalTx.length;
  const key=['102','101','103','203'].map(accByCode).filter(Boolean),cats=expenseCategoryData(monthLines).slice(0,5);
  const body=`${monthBar()}<section class="summary-card"><div><span>${monthTitle()} 순이익</span><strong class="purple">${won(x.net_income)}</strong><small>매출 ${won(x.revenue)} · 비용 ${won(x.expense)}</small></div><div class="summary-metrics"><div><span>매출</span><b class="blue">${won(x.revenue)}</b></div><div><span>비용</span><b class="red">${won(x.expense)}</b></div><div><span>자산</span><b>${won(x.assets)}</b></div><div><span>부채</span><b>${won(x.liabilities)}</b></div></div></section>
  <div class="dash-grid"><section class="card chart-card"><h3>월별 손익 추이 (최근 6개월)</h3><div class="legend"><span class="blue">● 매출</span><span class="red">● 비용</span><span class="purple">● 순이익</span></div>${trendSvg(hist)}</section><section class="card" data-home-balances><h3>계좌별 잔액</h3>${key.map(a=>`<div class="row"><span>${a.name}</span><b data-home-balance-code="${a.code}" class="${a.code==='203'?'red':''}">${won((b['code:'+a.code]??b[a.id]??0))}</b></div>`).join('')}<button class="text-link" onclick="go('funds')">자금 현황 전체보기 →</button></section></div>
  <div class="dash-grid"><section class="card"><h3>지출 카테고리 TOP 5</h3>${categoryBars(cats)}<button class="text-link" onclick="go('fs')">손익계산서 자세히 →</button></section><section class="card"><h3>이번 달 요약</h3><div class="row"><span>전체 거래</span><b>${total}건</b></div><div class="row"><span>거래처 기록</span><b>${normalTx.filter(t=>t.counterparty).length}건</b></div><button class="text-link" onclick="go('tx')">거래 내역 보기 →</button></section></div>
  <div class="dash-grid three"><section class="card"><h3>이번 달 거래 현황</h3><div class="row"><span>전체 거래</span><b>${total}건</b></div><div class="row"><span>매출 거래</span><b class="blue">${(tx||[]).filter(t=>txKind(t)==='매출').length}건</b></div><div class="row"><span>비용 거래</span><b class="red">${(tx||[]).filter(t=>txKind(t)==='비용').length}건</b></div></section><section class="card"><h3>거래처 메모</h3><p class="muted">거래 입력 시 거래처와 메모를 함께 남길 수 있습니다.</p><div class="mini-stat"><b>${(tx||[]).filter(t=>t.counterparty).length}건</b><span>거래처 기록</span></div><button class="text-link" onclick="go('tx')">거래 검색하기 →</button></section><section class="card report-card"><h3>월간 보고서</h3><p class="muted">현재 월의 손익·재무상태·자금·지출 분석을 한 장으로 출력합니다.</p><button class="btn primary" onclick="go('report')">보고서 보기 / PDF</button></section></div>
  <div class="section-title">최근 거래</div><div class="card">${tx?.length?tx.map(t=>`<button class="row txrow" onclick="transactionDetail('${t.id}')"><div><b>${esc(t.description)}</b><div class="muted">${t.transaction_date} · ${txKind(t)} ${t.counterparty?'· '+esc(t.counterparty):''}</div></div><span class="amount ${txKindClass(t)}">${won(txAmount(t))}</span></button>`).join(''):'<div class="empty">등록된 거래가 없습니다.<br><button class="text-link" onclick="go(\'add\')">첫 거래 입력하기</button></div>'}</div>${state.install?'<button class="btn install" style="width:100%" onclick="installApp()">📲 홈 화면에 앱 설치하기</button>':''}`;
  $('#app').innerHTML=shell(body); refreshHomeBalanceCard()
}
async function transactions(){
  const[s,e]=monthRange();
  const{data}=await sb.from('transactions').select('id,transaction_date,description,counterparty,memo,transaction_lines(account_id,debit,credit,accounts(id,name,type))').eq('academy_id',state.academy.id).gte('transaction_date',s).lte('transaction_date',e).order('transaction_date',{ascending:false}).limit(500);
  state.txCache=data||[];
  const controls=`<div class="tx-tools"><div class="search-box"><span>⌕</span><input id="txSearch" placeholder="내용·거래처·메모 검색" oninput="filterTransactions()"></div><select id="txType" onchange="filterTransactions()"><option value="all">전체 유형</option><option value="매출">매출</option><option value="비용">비용</option><option value="자금이동">자금이동</option><option value="카드대금">카드대금</option></select></div>`;
  $('#app').innerHTML=shell(`${monthBar()}<div class="section-title">${monthTitle()} 거래 내역</div>${controls}<div id="txResults"></div><div class="notice">검색과 유형으로 거래를 빠르게 찾을 수 있습니다. 거래를 누르면 수정·삭제할 수 있습니다.</div>`);
  filterTransactions();
}
function filterTransactions(){
  const q=($('#txSearch')?.value||'').trim().toLowerCase(),type=$('#txType')?.value||'all';
  const list=(state.txCache||[]).filter(t=>{
    const mq=!q||[t.description,t.counterparty,t.memo].some(v=>String(v||'').toLowerCase().includes(q));
    const mt=type==='all'||txKind(t)===type;
    return mq&&mt;
  });
  const target=$('#txResults'); if(!target)return;
  target.innerHTML=`<div class="result-count">검색 결과 <b>${list.length}건</b></div><div class="card">${list.length?list.map(t=>`<button class="row txrow" onclick="transactionDetail('${t.id}')"><div><b>${esc(t.description)}</b><div class="muted">${t.transaction_date} · ${txKind(t)} ${t.counterparty?'· '+esc(t.counterparty):''}</div></div><span class="amount ${txKindClass(t)}">${won(txAmount(t))}</span></button>`).join(''):'<div class="empty">조건에 맞는 거래가 없습니다.</div>'}</div>`;
}
function opts(list,selected){return list.map(a=>`<option value="${a.id}" ${a.id===selected?'selected':''}>${a.name}</option>`).join('')}
function byType(type){return state.accounts.filter(a=>a.type===type)}
function expenseCounterparts(){return state.accounts.filter(a=>a.type==='asset'||(a.type==='liability'&&a.code==='203'))}
async function transactionDetail(id){
  const{data:t,error}=await sb.from('transactions').select('id,transaction_date,description,counterparty,memo,transaction_lines(account_id,debit,credit,accounts(id,code,name,type))').eq('id',id).eq('academy_id',state.academy.id).maybeSingle();
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
  $('#app').innerHTML=shell(`<div class="section-title">거래 수정</div><div class="card"><div class="field"><label>날짜</label><input id="editDate" type="date" value="${t.transaction_date}"></div><div class="field"><label>내용</label><input id="editDesc" value="${esc(t.description)}"></div><div class="field"><label>거래처 (선택)</label><input id="editCounterparty" value="${esc(t.counterparty||'')}" placeholder="예: 교보문고, 삼성카드"></div><div class="field"><label>메모 (선택)</label><textarea id="editMemo" placeholder="관리용 메모를 남겨두세요.">${esc(t.memo||'')}</textarea></div><div class="field"><label>금액</label><input id="editAmount" type="number" min="1" value="${amt}"></div>${fields}<button class="btn primary" onclick="updateTx('${t.id}','${kind}')">수정 저장</button><button class="btn danger-lite" onclick="deleteTx('${t.id}')">이 거래 삭제</button><button class="btn" style="width:100%;margin-top:10px" onclick="go('tx')">목록으로</button><p id="msg" class="muted"></p></div>`)
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
  const meta=await sb.rpc('set_transaction_details',{p_transaction:id,p_counterparty:$('#editCounterparty')?.value||'',p_memo:$('#editMemo')?.value||''});if(meta.error){$('#msg').textContent=meta.error.message;return}
  state.tab='tx';await transactions()
}
async function deleteTx(id){if(!confirm('이 거래를 삭제할까요? 삭제하면 재무제표에서도 즉시 빠집니다.'))return;const{error}=await sb.rpc('delete_journal',{p_transaction:id});if(error){alert(error.message);return}state.tab='tx';await transactions()}

function accountOptions(type){return state.accounts.filter(a=>!type||a.type===type).map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}
function counterOptions(kind){const arr=kind==='income'?byType('asset'):expenseCounterparts();return arr.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}
function addView(){const today=localDateISO();$('#app').innerHTML=shell(`<div class="section-title">새 거래</div><div class="card"><div class="tabs"><button id="incomeBtn" class="btn on" onclick="setKind('income')">돈이 들어왔어요</button><button id="expenseBtn" class="btn" onclick="setKind('expense')">돈을 썼어요</button></div><input id="kind" type="hidden" value="income"><div class="field"><label>날짜</label><input id="date" type="date" value="${today}"></div><div class="field"><label>내용</label><input id="desc" placeholder="예: 8월 학원 매출"></div><div class="field"><label>거래처 (선택)</label><input id="counterparty" placeholder="예: 학부모 카드매출, 교보문고"></div><div class="field"><label>메모 (선택)</label><textarea id="memo" placeholder="원장님만 볼 관리용 메모"></textarea></div><div class="field"><label>금액</label><input id="amount" type="number" min="1" inputmode="numeric" placeholder="0"></div><div class="field"><label id="catLabel">수익 계정</label><select id="category">${accountOptions('revenue')}</select></div><div class="field"><label id="counterLabel">받은 곳</label><select id="counter">${counterOptions('income')}</select><div id="quickMethods" class="chips"><button type="button" onclick="pickCounter('102')">계좌</button><button type="button" onclick="pickCounter('101')">현금</button></div></div><button class="btn primary" onclick="saveTx()">저장하기</button><p id="msg" class="muted"></p></div><div class="notice">카드결제 매출은 중복 입력을 막기 위해 <b>자금 → 카드매출 정산</b>에서 하루 카드결제 총액으로 기록하는 것을 권장합니다.</div>`)}
function pickCounter(code){const a=state.accounts.find(x=>x.code===code);if(a&&$('#counter'))$('#counter').value=a.id}
function setKind(k){$('#kind').value=k;$('#incomeBtn').classList.toggle('on',k==='income');$('#expenseBtn').classList.toggle('on',k==='expense');$('#catLabel').textContent=k==='income'?'수익 계정':'비용 계정';$('#category').innerHTML=accountOptions(k==='income'?'revenue':'expense');$('#counterLabel').textContent=k==='income'?'받은 곳':'결제 수단';$('#counter').innerHTML=counterOptions(k);$('#quickMethods').innerHTML=k==='income'?`<button type="button" onclick="pickCounter('102')">계좌</button><button type="button" onclick="pickCounter('101')">현금</button><button type="button" onclick="pickCounter('103')">카드매출</button>`:`<button type="button" onclick="pickCounter('102')">계좌</button><button type="button" onclick="pickCounter('101')">현금</button><button type="button" onclick="pickCounter('203')">신용카드</button>`}
async function saveTx(){const k=$('#kind').value,amt=Number($('#amount').value),cat=$('#category').value,counter=$('#counter').value;if(!amt||!$('#desc').value.trim()){$('#msg').textContent='내용과 금액을 입력해주세요.';return}const counterAcc=state.accounts.find(a=>a.id===counter);let lines;if(k==='income')lines=[{account_id:counter,debit:amt,credit:0},{account_id:cat,debit:0,credit:amt}];else lines=[{account_id:cat,debit:amt,credit:0},{account_id:counter,debit:0,credit:amt}];$('#msg').textContent='저장 중…';const{data,error}=await sb.rpc('post_journal',{p_academy:state.academy.id,p_date:$('#date').value,p_description:$('#desc').value,p_lines:lines});if(error){$('#msg').textContent=error.message;return}const txId=typeof data==='string'?data:(Array.isArray(data)?data[0]:data);if(txId){const meta=await sb.rpc('set_transaction_details',{p_transaction:txId,p_counterparty:$('#counterparty')?.value||'',p_memo:$('#memo')?.value||''});if(meta.error){$('#msg').textContent='거래는 저장됐지만 거래처/메모 저장 실패: '+meta.error.message;return}}state.tab='home';state.month=$('#date').value.slice(0,7);await home()}

async function statements(){const x=await summary();const[s,e]=monthRange();const{data:lines}=await sb.from('transaction_lines').select('debit,credit,accounts(name,type),transactions!inner(academy_id,transaction_date)').eq('transactions.academy_id',state.academy.id).gte('transactions.transaction_date',s).lte('transactions.transaction_date',e);const groups={revenue:{},expense:{}};(lines||[]).forEach(l=>{const t=l.accounts?.type;if(!groups[t])return;const n=l.accounts.name;groups[t][n]=(groups[t][n]||0)+(t==='revenue'?Number(l.credit)-Number(l.debit):Number(l.debit)-Number(l.credit))});const rows=o=>Object.entries(o).map(([n,v])=>`<div class="row"><span>${n}</span><b>${won(v)}</b></div>`).join('')||'<div class="muted">내역 없음</div>';const displayedEquity=Number(x.equity||0)+Number(x.net_income||0);$('#app').innerHTML=shell(`${monthBar()}<div class="section-title">${monthTitle()} 손익계산서</div><div class="card statement"><h3>수익</h3>${rows(groups.revenue)}<div class="row"><b>수익 합계</b><b class="blue">${won(x.revenue)}</b></div></div><div class="card statement"><h3>비용</h3>${rows(groups.expense)}<div class="row"><b>비용 합계</b><b class="red">${won(x.expense)}</b></div></div><div class="card hero"><div class="muted">당기순이익</div><div class="big">${won(x.net_income)}</div></div><div class="section-title">${monthTitle()} 말 재무상태 요약</div><div class="card"><div class="row"><span>자산</span><b>${won(x.assets)}</b></div><div class="row"><span>부채</span><b>${won(x.liabilities)}</b></div><div class="row"><span>자본 (당기순이익 포함)</span><b>${won(displayedEquity)}</b></div><div class="row"><span>부채 + 자본</span><b>${won(Number(x.liabilities||0)+displayedEquity)}</b></div></div>`)}

async function balances(){const[,e]=monthRange();const{data,error}=await sb.rpc('account_balance_summary',{p_academy:state.academy.id,p_end:e});if(error){console.error('balance summary error',error);return {}}const b={};(data||[]).forEach(r=>{b[r.account_id]=Number(r.balance||0);if(r.account_code)b['code:'+r.account_code]=Number(r.balance||0)});return b}
function accByCode(code){return state.accounts.find(a=>a.code===code)}
async function refreshHomeBalanceCard(){
  const host=document.querySelector('[data-home-balances]');
  if(!host)return;
  const[,e]=monthRange();
  const{data,error}=await sb.rpc('account_balance_summary',{p_academy:state.academy.id,p_end:e});
  if(error){console.error('home balance refresh error',error);return}
  const byCode={};(data||[]).forEach(r=>byCode[String(r.account_code)]=Number(r.balance||0));
  ['102','101','103','203'].forEach(code=>{
    const el=document.querySelector(`[data-home-balance-code="${code}"]`);
    if(el)el.textContent=won(byCode[code]||0);
  });
}
async function funds(){
  const b=await balances(),key=['101','102','103','203'].map(accByCode).filter(Boolean);
  $('#app').innerHTML=shell(`${monthBar()}<div class="section-title">${monthTitle()} 말 자금 현황</div><div class="grid two">${key.map(a=>`<button class="card metric account-card" onclick="accountDetail('${a.id}')"><span class="muted">${a.name}</span><b class="${a.code==='203'?'red':''}">${won((b['code:'+a.code]??b[a.id]??0))}</b><small>상세내역 보기 →</small></button>`).join('')}</div><div class="section-title">카드·자금 처리</div><div class="card action-list"><button class="action card-action-featured" onclick="go('card')"><b>카드매출 정산</b><span class="muted">일일 카드매출 · 카드사별 실입금 · 수수료 자동계산</span></button><button class="action" onclick="fundAction('cardPay')"><b>카드대금 결제</b><span class="muted">보통예금 → 카드미지급금</span></button><button class="action" onclick="fundAction('transfer')"><b>현금·계좌 자금이동</b><span class="muted">자산 계정끼리 이동</span></button></div><div class="notice">카드매출은 하루 총액을 한 번 기록하고, 실제 카드사 입금일에 카드사별 정산을 기록하면 월 카드수수료가 자동 집계됩니다.</div>`)
}
function cardCompanyOptions(selected='신한카드'){
  const list=['신한카드','KB국민카드','삼성카드','현대카드','롯데카드','하나카드','우리카드','NH농협카드','BC카드','기타카드'];
  return list.map(v=>`<option ${v===selected?'selected':''}>${v}</option>`).join('')
}
function cardFeePreview(){
  const gross=Number($('#csGross')?.value||0),deposit=Number($('#csDeposit')?.value||0),fee=Math.max(0,gross-deposit),rate=gross?fee/gross*100:0;
  const f=$('#csFee');if(f)f.value=new Intl.NumberFormat('ko-KR').format(fee);
  const r=$('#csRate');if(r)r.textContent=`수수료율 ${rate.toFixed(2)}%`;
}
async function cardSettlement(){
  const[s,e]=monthRange(),b=await balances();
  const[{data:daily,error:de},{data:settles,error:se}]=await Promise.all([
    sb.from('card_daily_sales').select('id,sale_date,gross_amount,memo,transaction_id').eq('academy_id',state.academy.id).gte('sale_date',s).lte('sale_date',e).order('sale_date',{ascending:false}).limit(500),
    sb.from('card_settlements').select('id,card_company,deposit_date,period_start,period_end,gross_amount,deposit_amount,fee_amount,memo,transaction_id').eq('academy_id',state.academy.id).gte('deposit_date',s).lte('deposit_date',e).order('deposit_date',{ascending:false}).limit(500)
  ]);
  if(de||se){alert((de||se).message);return}
  const dailyTotal=(daily||[]).reduce((a,x)=>a+Number(x.gross_amount||0),0),depositTotal=(settles||[]).reduce((a,x)=>a+Number(x.deposit_amount||0),0),feeTotal=(settles||[]).reduce((a,x)=>a+Number(x.fee_amount||0),0);
  const recv=accByCode('103'),outstanding=recv?Number(b['code:103']??b[recv.id]??0):0;
  const companies={};(settles||[]).forEach(x=>{const k=x.card_company;companies[k]=(companies[k]||0)+Number(x.fee_amount||0)});
  const companyRows=Object.entries(companies).sort((a,b)=>b[1]-a[1]);
  const today=localDateISO(),bankAssets=byType('asset').filter(a=>['101','102'].includes(a.code));
  const body=`${monthBar()}<div class="card-settle-head"><div><div class="section-title">카드매출 정산</div><div class="muted">하루 카드매출 총액과 카드사별 실제 입금액을 연결해 카드수수료를 자동 계산합니다.</div></div><button class="btn" onclick="go('funds')">자금으로 돌아가기</button></div>
  <div class="card-kpis"><div class="card kpi-icon"><span>▣</span><div><small>이번 달 카드매출</small><b>${won(dailyTotal)}</b><em>${daily?.length||0}일 입력</em></div></div><div class="card kpi-icon"><span>▤</span><div><small>실입금 합계</small><b>${won(depositTotal)}</b><em>${settles?.length||0}건 정산</em></div></div><div class="card kpi-icon"><span>%</span><div><small>이번 달 카드수수료</small><b class="purple">${won(feeTotal)}</b><em>${dailyTotal?((feeTotal/dailyTotal)*100).toFixed(2):'0.00'}%</em></div></div><div class="card kpi-icon"><span>⌛</span><div><small>현재 카드미수금</small><b>${won(outstanding)}</b><em>정산 대기 잔액</em></div></div></div>
  <div class="card-work-grid"><section class="card"><h3>일일 카드매출 입력</h3><div class="field"><label>날짜</label><input id="cdDate" type="date" value="${today}"></div><div class="field"><label>하루 카드 결제 총액</label><input id="cdAmount" type="number" min="1" placeholder="0"></div><div class="field"><label>메모 (선택)</label><textarea id="cdMemo" placeholder="예: 정규수업 카드결제 총액"></textarea></div><button class="btn primary" style="width:100%" onclick="saveDailyCardSale()">카드매출 저장</button><div id="cdMsg" class="msg"></div><div class="settle-tip">이 금액은 <b>학원매출 + 카드미수금</b>으로 자동 기록됩니다.</div></section>
  <section class="card card-settlement-form"><div class="form-title-row"><h3>카드사별 실입금 정산</h3><span class="purple">수수료 자동 계산</span></div><div class="form-grid two"><div class="field"><label>카드사</label><select id="csCompany">${cardCompanyOptions()}</select></div><div class="field"><label>입금일</label><input id="csDate" type="date" value="${today}"></div><div class="field"><label>대상 매출 시작일</label><input id="csStart" type="date" value="${s}"></div><div class="field"><label>대상 매출 종료일</label><input id="csEnd" type="date" value="${e}"></div><div class="field"><label>정산 대상 카드매출 총액</label><input id="csGross" type="number" min="1" placeholder="카드사 정산서 총액" oninput="cardFeePreview()"></div><div class="field"><label>실제 통장 입금액</label><input id="csDeposit" type="number" min="1" placeholder="통장 입금액" oninput="cardFeePreview()"></div><div class="field"><label>카드수수료 (자동)</label><input id="csFee" readonly value="0"></div><div class="field"><label>입금계좌</label><select id="csBank">${opts(bankAssets,accByCode('102')?.id)}</select></div></div><div class="fee-equation"><b>정산 대상 매출</b><span>−</span><b>실입금</b><span>=</span><strong>카드수수료</strong><small id="csRate">수수료율 0.00%</small></div><div class="field"><label>메모 (선택)</label><input id="csMemo" placeholder="예: 신한카드 8/1~8/7 정산"></div><button class="btn primary" style="width:100%" onclick="saveCardSettlement()">정산 저장</button><div id="csMsg" class="msg"></div></section></div>
  <div class="card-data-grid"><section class="card"><div class="form-title-row"><h3>정산 현황</h3><span class="muted">최근 ${settles?.length||0}건</span></div><div class="settle-table"><div class="settle-tr settle-th"><span>입금일</span><span>카드사</span><span>정산매출</span><span>실입금</span><span>수수료</span></div>${settles?.length?settles.map(x=>`<button class="settle-tr" onclick="transactionDetail('${x.transaction_id}')"><span>${x.deposit_date}</span><span>${esc(x.card_company)}</span><span>${won(x.gross_amount)}</span><span>${won(x.deposit_amount)}</span><span class="red">${won(x.fee_amount)}</span></button>`).join(''):'<div class="empty compact">아직 카드사 정산 내역이 없습니다.</div>'}</div></section>
  <section class="card"><h3>이번 달 카드수수료 요약</h3><div class="fee-total">${won(feeTotal)}</div>${companyRows.length?`<div class="category-bars">${companyRows.map(([name,val])=>`<div class="cat-row"><div class="cat-label"><span>${esc(name)}</span><b>${won(val)}</b></div><div class="cat-track"><i style="width:${feeTotal?Math.max(3,val/feeTotal*100):0}%"></i></div></div>`).join('')}</div>`:'<div class="empty compact">정산을 입력하면 카드사별 수수료가 표시됩니다.</div>'}<div class="settle-tip">카드사 정산서의 <b>총 정산대상 금액</b>과 실제 통장 입금액을 입력하면 차액을 지급수수료로 기록합니다.</div></section></div>
  <section class="card"><div class="form-title-row"><h3>일일 카드매출 기록</h3><span class="muted">${daily?.length||0}건</span></div><div class="daily-card-list">${daily?.length?daily.map(x=>`<button class="row txrow" onclick="transactionDetail('${x.transaction_id}')"><div><b>${x.sale_date} 카드매출</b><div class="muted">${esc(x.memo||'일일 카드결제 총액')}</div></div><span class="amount blue">${won(x.gross_amount)}</span></button>`).join(''):'<div class="empty compact">이번 달 카드매출 입력이 없습니다.</div>'}</div></section>`;
  $('#app').innerHTML=shell(body)
}
async function saveDailyCardSale(){
  const amount=Number($('#cdAmount').value||0),date=$('#cdDate').value,memo=$('#cdMemo').value||'';
  if(!date||amount<=0){$('#cdMsg').textContent='날짜와 카드매출 총액을 입력해주세요.';return}
  $('#cdMsg').textContent='저장 중…';
  const{error}=await sb.rpc('record_daily_card_sale',{p_academy:state.academy.id,p_date:date,p_amount:amount,p_memo:memo});
  if(error){$('#cdMsg').textContent=error.message;return}
  $('#cdMsg').textContent='카드매출이 저장되었습니다.';setTimeout(()=>go('card'),350)
}
async function saveCardSettlement(){
  const gross=Number($('#csGross').value||0),deposit=Number($('#csDeposit').value||0),company=$('#csCompany').value,date=$('#csDate').value,start=$('#csStart').value,end=$('#csEnd').value,bank=$('#csBank').value,memo=$('#csMemo').value||'';
  if(!company||!date||!start||!end||gross<=0||deposit<=0){$('#csMsg').textContent='카드사·기간·정산매출·실입금액을 모두 입력해주세요.';return}
  if(deposit>gross){$('#csMsg').textContent='실입금액은 정산 대상 카드매출보다 클 수 없습니다.';return}
  $('#csMsg').textContent='정산 저장 중…';
  const{error}=await sb.rpc('record_card_settlement',{p_academy:state.academy.id,p_card_company:company,p_deposit_date:date,p_period_start:start,p_period_end:end,p_gross_amount:gross,p_deposit_amount:deposit,p_bank_account:bank,p_memo:memo});
  if(error){$('#csMsg').textContent=error.message;return}
  $('#csMsg').textContent='정산이 저장되었습니다.';setTimeout(()=>go('card'),350)
}

async function accountDetail(accountId){
  const a=state.accounts.find(x=>x.id===accountId); if(!a)return;
  const[,e]=monthRange();
  const{data:lines,error}=await sb.from('transaction_lines').select('debit,credit,transactions!inner(id,academy_id,transaction_date,description)').eq('account_id',accountId).eq('transactions.academy_id',state.academy.id).lte('transactions.transaction_date',e).order('transactions(transaction_date)',{ascending:false}).limit(300);
  if(error){alert(error.message);return}
  let running=0;
  const normalCredit=['liability','equity','revenue'].includes(a.type);
  const rows=(lines||[]).map(l=>{
    const delta=normalCredit?Number(l.credit||0)-Number(l.debit||0):Number(l.debit||0)-Number(l.credit||0);
    running+=delta;
    return {...l,delta};
  });
  const current=running;
  $('#app').innerHTML=shell(`${monthBar()}<div class="detail-head"><div><div class="section-title">${esc(a.name)} 상세내역</div><div class="muted">${a.code} · ${a.type}</div></div><div class="detail-balance"><span>현재 잔액</span><b>${won(current)}</b></div></div><div class="card ledger">${rows.length?rows.map(l=>`<button class="row txrow" onclick="transactionDetail('${l.transactions.id}')"><div><b>${esc(l.transactions.description)}</b><div class="muted">${l.transactions.transaction_date}</div></div><span class="amount ${l.delta<0?'red':l.delta>0?'blue':''}">${l.delta>0?'+':''}${won(l.delta)}</span></button>`).join(''):'<div class="empty">이 계정의 거래가 없습니다.</div>'}</div><button class="btn" style="width:100%;margin-top:12px" onclick="go('funds')">자금 화면으로</button>`);
}

function fundAction(type){const today=localDateISO(),assets=byType('asset');let title='',desc='',fields='';if(type==='cardDeposit'){title='카드매출 입금';desc='카드매출 정산 입금';fields=`<div class="field"><label>입금 계좌</label><select id="fundTo">${opts(assets,accByCode('102')?.id)}</select></div>`}else if(type==='cardPay'){title='카드대금 결제';desc='신용카드 대금 결제';fields=`<div class="field"><label>출금 계좌</label><select id="fundFrom">${opts(assets,accByCode('102')?.id)}</select></div>`}else{title='현금·계좌 자금이동';desc='자금 이동';fields=`<div class="field"><label>보내는 곳</label><select id="fundFrom">${opts(assets,accByCode('101')?.id)}</select></div><div class="field"><label>받는 곳</label><select id="fundTo">${opts(assets,accByCode('102')?.id)}</select></div>`}$('#app').innerHTML=shell(`<div class="section-title">${title}</div><div class="card"><div class="field"><label>날짜</label><input id="fundDate" type="date" value="${today}"></div><div class="field"><label>내용</label><input id="fundDesc" value="${desc}"></div><div class="field"><label>금액</label><input id="fundAmount" type="number" min="1" placeholder="0"></div>${fields}<button class="btn primary" onclick="saveFund('${type}')">저장하기</button><button class="btn" style="width:100%;margin-top:10px" onclick="go('funds')">취소</button><p id="msg" class="muted"></p></div>`)}
async function saveFund(type){const amt=Number($('#fundAmount').value),desc=$('#fundDesc').value.trim();if(!amt||!desc){$('#msg').textContent='내용과 금액을 입력해주세요.';return}let lines=[];if(type==='cardDeposit'){const card=accByCode('103');lines=[{account_id:$('#fundTo').value,debit:amt,credit:0},{account_id:card.id,debit:0,credit:amt}]}else if(type==='cardPay'){const payable=accByCode('203');lines=[{account_id:payable.id,debit:amt,credit:0},{account_id:$('#fundFrom').value,debit:0,credit:amt}]}else{if($('#fundFrom').value===$('#fundTo').value){$('#msg').textContent='보내는 곳과 받는 곳을 다르게 선택해주세요.';return}lines=[{account_id:$('#fundTo').value,debit:amt,credit:0},{account_id:$('#fundFrom').value,debit:0,credit:amt}]}const{error}=await sb.rpc('post_journal',{p_academy:state.academy.id,p_date:$('#fundDate').value,p_description:desc,p_lines:lines});if(error){$('#msg').textContent=error.message;return}state.month=$('#fundDate').value.slice(0,7);state.tab='funds';await funds()}


async function report(){
  const x=await summary(),b=await balances(),[s,e]=monthRange();
  const[{data:tx},{data:lines}]=await Promise.all([
    sb.from('transactions').select('id,transaction_date,description,counterparty,memo,transaction_lines(debit,credit,accounts(name,type))').eq('academy_id',state.academy.id).gte('transaction_date',s).lte('transaction_date',e).order('transaction_date',{ascending:false}).limit(300),
    sb.from('transaction_lines').select('debit,credit,accounts(name,type),transactions!inner(academy_id,transaction_date)').eq('transactions.academy_id',state.academy.id).gte('transactions.transaction_date',s).lte('transactions.transaction_date',e)
  ]);
  const reportTx=(tx||[]).filter(t=>t.description!=='초기잔액 설정'),total=reportTx.length, displayedEquity=Number(x.equity||0)+Number(x.net_income||0), margin=Number(x.revenue||0)?Math.round(Number(x.net_income||0)/Number(x.revenue||0)*1000)/10:0;
  const cash=accByCode('101'),bank=accByCode('102'),recv=accByCode('103'),pay=accByCode('203'),cats=expenseCategoryData(lines).slice(0,5);
  const cp={};reportTx.filter(t=>t.counterparty).forEach(t=>cp[t.counterparty]=(cp[t.counterparty]||0)+1);const topCp=Object.entries(cp).sort((a,b)=>b[1]-a[1]).slice(0,5);
  $('#app').innerHTML=shell(`${monthBar()}<div class="report-toolbar"><div><h2>${monthTitle()} 월간 재무 보고서</h2><div class="muted">${esc(state.academy.name)} · 경영관리용</div></div><button class="btn primary" onclick="window.print()">PDF로 저장 / 인쇄</button></div><article class="print-report"><div class="report-brand"><img src="./logo-transparent.png?v=954"><div><h1>${esc(state.academy.name)}</h1><p>${monthTitle()} 월간 재무 보고서</p></div></div><div class="report-kpis"><div><span>매출</span><b>${won(x.revenue)}</b></div><div><span>비용</span><b>${won(x.expense)}</b></div><div><span>순이익</span><b>${won(x.net_income)}</b></div><div><span>자산</span><b>${won(x.assets)}</b></div><div><span>순이익률</span><b>${margin}%</b></div></div><h3>재무상태 요약</h3><div class="report-table"><div><span>자산</span><b>${won(x.assets)}</b></div><div><span>부채</span><b>${won(x.liabilities)}</b></div><div><span>자본(당기순이익 포함)</span><b>${won(displayedEquity)}</b></div></div><h3>자금 현황</h3><div class="report-table"><div><span>보통예금</span><b>${won(bank?(b['code:'+bank.code]??b[bank.id]??0):0)}</b></div><div><span>현금</span><b>${won(cash?(b['code:'+cash.code]??b[cash.id]??0):0)}</b></div><div><span>카드미수금</span><b>${won(recv?(b['code:'+recv.code]??b[recv.id]??0):0)}</b></div><div><span>카드미지급금</span><b>${won(pay?(b['code:'+pay.code]??b[pay.id]??0):0)}</b></div></div><h3>지출 카테고리 TOP 5</h3>${categoryBars(cats)}<h3>자주 기록한 거래처</h3><div class="report-table">${topCp.length?topCp.map(([n,c])=>`<div><span>${esc(n)}</span><b>${c}건</b></div>`).join(''):'<div><span>거래처 기록</span><b>없음</b></div>'}</div><h3>거래 요약</h3><div class="report-table"><div><span>전체 거래</span><b>${total}건</b></div><div><span>거래처 기록</span><b>${reportTx.filter(t=>t.counterparty).length}건</b></div></div><p class="report-note">※ 본 보고서는 학원 내부 경영관리용입니다. 세무 신고 및 외부 제출용 공식 재무제표는 전문가 검토가 필요합니다.</p></article>`)
}
function settings(){
  const email=state.session.user.email;
  $('#app').innerHTML=shell(`<div class="section-title">설정</div>
  <div class="card"><div class="row"><span>학원</span><b>${state.academy.name}</b></div><div class="row"><span>로그인</span><b>${email}</b></div><div class="row"><span>통화</span><b>KRW (원)</b></div><div class="row"><span>버전</span><b>v9.5.4 실사용 안정형</b></div></div>
  <div class="card"><h3>실사용 시작 도구</h3><p class="muted">기존 학원 장부를 오늘부터 시작한다면 실제 통장·현금·카드 잔액을 한 번 입력하세요.</p>
    <button class="btn primary" onclick="openingBalanceView()">초기잔액 입력</button>
    <button class="btn" style="margin-left:8px" onclick="exportBackupCsv()">CSV 백업 다운로드</button>
  </div>
  <div class="card"><h3>기본 계정과목</h3>${state.accounts.map(a=>`<div class="row"><span>${a.code} · ${a.name}</span><span class="muted">${a.type}</span></div>`).join('')}</div>
  <div class="notice">로그인 세션은 자동 갱신되도록 안정화했습니다. 장시간 켜두어도 만료 직전에 자동으로 로그인 상태를 갱신합니다.</div>
  <div class="notice">이 앱은 경영관리용입니다. 세무 신고·외부감사 목적의 공식 재무제표는 세무/회계 전문가의 검토가 필요합니다.</div>`)
}
function openingBalanceView(){
  const today=localDateISO();
  $('#app').innerHTML=shell(`<div class="section-title">초기잔액 입력</div><div class="card form">
  <div class="notice">실제 사용 시작 시점의 잔액을 입력합니다. 한 번 저장하면 일반 거래처럼 수정·삭제할 수 있습니다.</div>
  <div class="field"><label>기준일</label><input id="obDate" type="date" value="${today}"></div>
  <div class="field"><label>보통예금 잔액</label><input id="obBank" type="number" min="0" value="0"></div>
  <div class="field"><label>현금 잔액</label><input id="obCash" type="number" min="0" value="0"></div>
  <div class="field"><label>카드미수금</label><input id="obRecv" type="number" min="0" value="0"></div>
  <div class="field"><label>카드미지급금</label><input id="obPay" type="number" min="0" value="0"></div>
  <button class="btn primary" style="width:100%" onclick="saveOpeningBalance()">초기잔액 저장</button><button class="btn" style="width:100%;margin-top:8px" onclick="go('settings')">취소</button><div id="msg" class="msg"></div></div>`)
}
async function saveOpeningBalance(){
  const vals={bank:Number($('#obBank').value||0),cash:Number($('#obCash').value||0),recv:Number($('#obRecv').value||0),pay:Number($('#obPay').value||0)};
  if(Object.values(vals).some(v=>v<0||!Number.isFinite(v))){$('#msg').textContent='0 이상의 금액만 입력해주세요.';return}
  const assets=vals.bank+vals.cash+vals.recv, liabilities=vals.pay;
  if(assets===0&&liabilities===0){$('#msg').textContent='입력할 잔액이 없습니다.';return}
  const lines=[], add=(code,debit,credit)=>{const a=accByCode(code);if(a&&(debit||credit))lines.push({account_id:a.id,debit,credit})};
  add('102',vals.bank,0); add('101',vals.cash,0); add('103',vals.recv,0); add('203',0,vals.pay);
  const diff=assets-liabilities;
  if(diff>0)add('301',0,diff); else if(diff<0)add('301',-diff,0);
  const{data,error}=await sb.rpc('post_journal',{p_academy:state.academy.id,p_date:$('#obDate').value,p_description:'초기잔액 설정',p_lines:lines});
  if(error){$('#msg').textContent=error.message;return}
  $('#msg').textContent='초기잔액이 저장되었습니다.';
  setTimeout(()=>go('home'),500)
}
function csvCell(v){const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
async function exportBackupCsv(){
  const{data,error}=await sb.from('transactions').select('id,transaction_date,description,counterparty,memo,transaction_lines(debit,credit,accounts(code,name,type))').eq('academy_id',state.academy.id).order('transaction_date',{ascending:true}).limit(5000);
  if(error){alert(error.message);return}
  const rows=[['날짜','거래내용','거래처','메모','계정코드','계정과목','유형','차변','대변']];
  (data||[]).forEach(t=>(t.transaction_lines||[]).forEach(l=>rows.push([t.transaction_date,t.description,t.counterparty||'',t.memo||'',l.accounts?.code||'',l.accounts?.name||'',l.accounts?.type||'',l.debit||0,l.credit||0])));
  const csv='\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=`${state.academy.name}_장부백업_${localDateISO()}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)
}
async function installApp(){if(state.install){await state.install.prompt();state.install=null}}
async function go(t){state.tab=t;if(t==='home')await home();else if(t==='tx')await transactions();else if(t==='add')addView();else if(t==='fs')await statements();else if(t==='funds')await funds();else if(t==='card')await cardSettlement();else if(t==='report')await report();else settings()}
async function render(){if(!state.session){$('#app').innerHTML=authView();return}if(!state.academy){$('#app').innerHTML=onboarding();return}await go(state.tab)}

window.addEventListener('error', e => {console.error('Academy Finance error:',e.error||e.message);const app=document.querySelector('#app');if(app&&app.textContent.includes('앱을 불러오는 중'))app.innerHTML=`<div class="auth"><h1>앱 실행 오류</h1><div class="card"><p class="muted">${String(e.message||'알 수 없는 오류')}</p><button class="btn primary" onclick="location.reload()">다시 불러오기</button></div></div>`});
window.addEventListener('unhandledrejection',e=>console.error('Academy Finance promise error:',e.reason));
async function restoreSession(){try{if(!state.session)render();const result=await Promise.race([sb.auth.getSession(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('로그인 상태 확인 시간이 초과되었습니다.')),8000))]);state.session=result?.data?.session||null;if(state.session)await loadAcademy();await render()}catch(err){console.error(err);state.session=null;document.querySelector('#app').innerHTML=authView()+`<div style="max-width:520px;margin:12px auto;padding:0 16px"><div class="notice">연결 확인 중 문제가 있었습니다: ${String(err.message||err)}</div></div>`}}
sb.auth.onAuthStateChange((_,session)=>{setTimeout(async()=>{try{state.session=session;state.academy=null;state.accounts=[];if(session)await loadAcademy();await render()}catch(err){console.error('auth state render error',err)}},0)});
render();restoreSession();
