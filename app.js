const STORAGE_KEY = "oshiGoodsManager.v1";
let state = { products: [], view: "home", listFilter: "all", statusFilter: null, search: "", sort: "updated" };
let editingImageData = "";
let currentDetailId = null;

const $ = (id) => document.getElementById(id);
const fmt = n => new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY",maximumFractionDigits:0}).format(Number(n||0));
const todayISO = () => new Date().toISOString().slice(0,10);
const statusLabel = {
  considering:"検討中", planned:"予約予定", ordered:"購入済み", waiting:"発送待ち",
  shipped:"発送済み", owned:"所持済み", skipped:"見送り"
};

function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify({products:state.products})); }
function load(){
  try{
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
    if(Array.isArray(v.products)) state.products=v.products;
  }catch(e){}
}
function uid(){ return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()); }
function esc(s=""){ return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])); }
function productTotal(p){ return (Number(p.price)||0)*(Number(p.purchasedQty)||0) + (Number(p.shippingFee)||0); }
function monthKey(d){ return (d||"").slice(0,7); }

function render(){
  renderSummary(); renderDeadlines(); renderProducts(); setNav();
}
function renderSummary(){
  $("sumConsidering").textContent = state.products.filter(p=>p.status==="considering").length;
  $("sumWaiting").textContent = state.products.filter(p=>["ordered","waiting"].includes(p.status)).length;
  const mk = new Date().toISOString().slice(0,7);
  const spent = state.products.filter(p=>monthKey(p.purchaseDate||p.createdAt)===mk && ["ordered","waiting","shipped","owned"].includes(p.status))
    .reduce((a,p)=>a+productTotal(p),0);
  $("sumMonth").textContent = fmt(spent);
}

function getDeadlines(p){
  const arr=[];
  [["受注終了",p.orderEnd],["予約締切",p.reserveDeadline],["発売日",p.releaseDate],["発送開始目安",p.shipStart]].forEach(([label,date])=>{
    if(date) arr.push({label,date});
  });
  return arr;
}
function renderDeadlines(){
  const now = new Date(); now.setHours(0,0,0,0);
  const items = state.products.flatMap(p=>getDeadlines(p).map(d=>({...d,p})))
    .filter(x=>new Date(x.date)>=now)
    .sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5);
  $("deadlineList").innerHTML = items.length ? items.map(x=>{
    const d = new Date(x.date+"T00:00:00");
    return `<button class="deadline-item" data-open="${x.p.id}">
      <div class="deadline-date">${d.getMonth()+1}/${d.getDate()}</div>
      <div><b>${esc(x.p.title)}</b><small>${x.label}</small></div>
    </button>`;
  }).join("") : `<div class="small-muted">直近の締切はありません。</div>`;
  document.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>openDetail(b.dataset.open));
}

function filteredProducts(){
  let arr=[...state.products];
  if(state.view==="owned") arr=arr.filter(p=>p.status==="owned" || totalOwned(p)>0);
  if(state.view==="transfers") arr=arr.filter(p=>totalTransfers(p)>0);
  if(state.statusFilter) arr=arr.filter(p=>p.status===state.statusFilter);
  if(state.listFilter==="owned") arr=arr.filter(p=>p.status==="owned" || totalOwned(p)>0);
  if(state.listFilter==="random") arr=arr.filter(p=>p.isRandom);
  if(state.search){
    const q=state.search.toLowerCase();
    arr=arr.filter(p=>[p.title,p.series,p.shop].some(v=>(v||"").toLowerCase().includes(q)));
  }
  if(state.sort==="deadline"){
    arr.sort((a,b)=>(nearestDeadline(a)||"9999").localeCompare(nearestDeadline(b)||"9999"));
  }else if(state.sort==="priceHigh"){arr.sort((a,b)=>Number(b.price||0)-Number(a.price||0))}
  else if(state.sort==="priceLow"){arr.sort((a,b)=>Number(a.price||0)-Number(b.price||0))}
  else arr.sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""));
  return arr;
}
function nearestDeadline(p){ return [p.orderEnd,p.reserveDeadline,p.releaseDate,p.shipStart].filter(Boolean).sort()[0]||""; }
function totalOwned(p){ return (p.variants||[]).reduce((a,v)=>a+Number(v.owned||0),0)+(p.bonuses||[]).reduce((a,v)=>a+Number(v.owned||0),0); }
function ownedTypes(p){ return (p.variants||[]).filter(v=>Number(v.owned||0)>0).length; }
function totalTransfers(p){ return (p.variants||[]).reduce((a,v)=>a+Number(v.transfer||0),0)+(p.bonuses||[]).reduce((a,v)=>a+Number(v.transfer||0),0); }

function renderProducts(){
  const arr=filteredProducts();
  $("productList").innerHTML=arr.map(p=>{
    const img=p.imageData?`<img class="thumb" src="${p.imageData}" alt="">`:`<div class="thumb">🎁</div>`;
    const owned = p.isRandom && p.variantCount ? `<span class="badge">所持 ${ownedTypes(p)}/${p.variantCount}種</span>` : (p.status==="owned"?`<span class="badge">所持済み</span>`:"");
    const ship = p.shippingText ? `<span class="badge">${esc(p.shippingText)}</span>`:"";
    return `<button class="product-card" data-id="${p.id}">
      ${img}
      <div>
        <div class="series">${esc(p.series||"未分類")}</div>
        <h3>${esc(p.title)}</h3>
        <div class="price">${fmt(p.price)}</div>
        <div class="meta-row"><span class="badge">${statusLabel[p.status]||p.status}</span>${owned}${ship}</div>
      </div>
    </button>`;
  }).join("");
  $("emptyState").classList.toggle("hidden",arr.length!==0);
  document.querySelectorAll(".product-card").forEach(b=>b.onclick=()=>openDetail(b.dataset.id));
  if(state.view==="money") renderMoneyView();
}
function renderMoneyView(){
  const monthMap={};
  state.products.forEach(p=>{
    if(!["ordered","waiting","shipped","owned"].includes(p.status)) return;
    const key=monthKey(p.purchaseDate||p.createdAt);
    if(!key) return;
    monthMap[key]=(monthMap[key]||0)+productTotal(p);
  });
  const rows=Object.entries(monthMap).sort((a,b)=>b[0].localeCompare(a[0]));
  $("productList").innerHTML = `<div class="detail-section"><h3>月別購入額</h3>${
    rows.length?rows.map(([m,v])=>`<div class="kv"><dt>${m}</dt><dd><b>${fmt(v)}</b></dd></div>`).join(""):`<p class="small-muted">まだ購入記録がありません。</p>`
  }</div>`;
  $("emptyState").classList.add("hidden");
}

function setNav(){
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view));
}

function resetForm(){
  $("productForm").reset(); $("productId").value=""; editingImageData="";
  $("imagePreview").classList.add("hidden"); $("imagePlaceholder").classList.remove("hidden");
  $("variantEditor").innerHTML=""; $("bonusEditor").innerHTML="";
  $("randomDetails").classList.add("hidden"); $("bonusDetails").classList.add("hidden");
  $("deleteBtn").classList.add("hidden"); $("formTitle").textContent="商品を追加";
  $("wantedQty").value=1; $("purchasedQty").value=0;
}
function openAdd(){ resetForm(); $("productDialog").showModal(); }
function openEdit(id){
  const p=state.products.find(x=>x.id===id); if(!p)return;
  resetForm(); $("formTitle").textContent="商品を編集"; $("productId").value=p.id;
  const fields=["series","status","title","price","shippingFee","orderStart","orderEnd","reserveDeadline","releaseDate","shippingText","shipStart","shipEnd","shop","orderNumber","url","wantedQty","purchasedQty","variantCount","favCount","purchaseLimit","boxPrice","boxCount","randomMode","notes"];
  fields.forEach(k=>{if($(k)) $(k).value=p[k]??""});
  $("isRandom").checked=!!p.isRandom; $("hasBonus").checked=!!p.hasBonus;
  toggleSections();
  editingImageData=p.imageData||"";
  if(editingImageData){$("imagePreview").src=editingImageData;$("imagePreview").classList.remove("hidden");$("imagePlaceholder").classList.add("hidden")}
  (p.variants||[]).forEach(v=>addVariantRow(v));
  (p.bonuses||[]).forEach(v=>addBonusRow(v));
  $("deleteBtn").classList.remove("hidden");
  $("productDialog").showModal();
  updateProbability();
}
function collectMiniRows(selector,prefix){
  return [...document.querySelectorAll(selector)].map(row=>({
    name:row.querySelector(`.${prefix}-name`).value.trim(),
    wanted:Number(row.querySelector(`.${prefix}-wanted`).value||0),
    owned:Number(row.querySelector(`.${prefix}-owned`).value||0),
    trade:Number(row.querySelector(`.${prefix}-trade`).value||0),
    transfer:Number(row.querySelector(`.${prefix}-transfer`).value||0),
    transferTo:row.querySelector(`.${prefix}-transferTo`).value.trim(),
    condition: row.querySelector(`.${prefix}-condition`)?.value.trim()||""
  })).filter(x=>x.name||x.condition||x.wanted||x.owned||x.trade||x.transfer);
}
function formProduct(){
  const now=new Date().toISOString();
  const existing=state.products.find(x=>x.id===$("productId").value);
  return {
    id:existing?.id||uid(), createdAt:existing?.createdAt||now, updatedAt:now,
    purchaseDate: existing?.purchaseDate || ((["ordered","waiting","shipped","owned"].includes($("status").value))?todayISO():""),
    imageData:editingImageData,
    series:$("series").value.trim(), status:$("status").value, title:$("title").value.trim(),
    price:Number($("price").value||0), shippingFee:Number($("shippingFee").value||0),
    isRandom:$("isRandom").checked, hasBonus:$("hasBonus").checked,
    orderStart:$("orderStart").value, orderEnd:$("orderEnd").value, reserveDeadline:$("reserveDeadline").value,
    releaseDate:$("releaseDate").value, shippingText:$("shippingText").value.trim(), shipStart:$("shipStart").value,
    shipEnd:$("shipEnd").value, shop:$("shop").value.trim(), orderNumber:$("orderNumber").value.trim(),
    url:$("url").value.trim(), wantedQty:Number($("wantedQty").value||0), purchasedQty:Number($("purchasedQty").value||0),
    variantCount:Number($("variantCount").value||0), favCount:Number($("favCount").value||0),
    purchaseLimit:Number($("purchaseLimit").value||0), boxPrice:Number($("boxPrice").value||0),
    boxCount:Number($("boxCount").value||0), randomMode:$("randomMode").value,
    variants:collectMiniRows(".variant-row","v"), bonuses:collectMiniRows(".bonus-row","b"),
    notes:$("notes").value.trim()
  }
}

function addVariantRow(v={}){
  const node=$("variantTemplate").content.cloneNode(true); const row=node.querySelector(".variant-row");
  [["name",v.name],["wanted",v.wanted||0],["owned",v.owned||0],["trade",v.trade||0],["transfer",v.transfer||0],["transferTo",v.transferTo||""]].forEach(([k,val])=>row.querySelector(`.v-${k}`).value=val??"");
  row.querySelector(".remove-mini").onclick=()=>row.remove(); $("variantEditor").appendChild(node);
}
function addBonusRow(v={}){
  const node=$("bonusTemplate").content.cloneNode(true); const row=node.querySelector(".bonus-row");
  [["name",v.name],["condition",v.condition||""],["wanted",v.wanted||0],["owned",v.owned||0],["trade",v.trade||0],["transfer",v.transfer||0],["transferTo",v.transferTo||""]].forEach(([k,val])=>row.querySelector(`.b-${k}`).value=val??"");
  row.querySelector(".remove-mini").onclick=()=>row.remove(); $("bonusEditor").appendChild(node);
}
function toggleSections(){
  $("randomDetails").classList.toggle("hidden",!$("isRandom").checked);
  $("bonusDetails").classList.toggle("hidden",!$("hasBonus").checked);
}
function updateProbability(){
  const n=Number($("variantCount").value||0), f=Number($("favCount").value||0), lim=Number($("purchaseLimit").value||0), mode=$("randomMode").value;
  let text="条件を入力すると確率を表示します。";
  if(n>0 && f>0 && lim>0){
    if(mode==="independent" || mode==="unknown"){
      const p=1-Math.pow((n-f)/n,lim);
      text=`${lim}個購入したとき、推し対象を1個以上引く単純確率：約 ${(p*100).toFixed(1)}%`;
      if(mode==="unknown") text += "（完全ランダムと仮定）";
    }else if(mode==="noDuplicate" && lim<=n){
      let miss=1;
      for(let i=0;i<lim;i++) miss*=Math.max(0,(n-f-i)/(n-i));
      text=`BOX内重複なしとして、${lim}個で推し対象を1個以上引く確率：約 ${((1-miss)*100).toFixed(1)}%`;
    }else if(mode==="complete"){ text="BOXコンプ保証なら、BOX購入時は全種入手想定です。"; }
    else text="特殊封入は個別の封入ルールが必要です。";
  }
  $("probabilityBox").textContent=text;
}

function openDetail(id){
  const p=state.products.find(x=>x.id===id); if(!p)return; currentDetailId=id;
  const img=p.imageData?`<img src="${p.imageData}" alt="">`:`<div class="detail-placeholder">🎁</div>`;
  let variants="";
  if(p.isRandom){
    const cards=(p.variants||[]).map(v=>`<div class="owned-card"><b>${esc(v.name||"名称未設定")}</b>
      <div class="small-muted">所持 ${v.owned||0} / 欲しい ${v.wanted||0}</div>
      <div class="small-muted">交換 ${v.trade||0} / 譲渡 ${v.transfer||0}${v.transferTo?` → ${esc(v.transferTo)}`:""}</div>
    </div>`).join("");
    variants=`<section class="detail-section"><h3>ランダム・所持状況</h3>
      <div class="kv"><dt>全種</dt><dd>${p.variantCount||"—"}</dd><dt>推し対象</dt><dd>${p.favCount||"—"}</dd><dt>購入上限</dt><dd>${p.purchaseLimit||"—"}個</dd><dt>BOX</dt><dd>${p.boxPrice?fmt(p.boxPrice):"—"} / ${p.boxCount||"—"}個</dd></div>
      <div class="owned-grid" style="margin-top:10px">${cards||`<div class="small-muted">絵柄は未登録です。</div>`}</div>
    </section>`;
  }
  let bonuses="";
  if((p.bonuses||[]).length){
    bonuses=`<section class="detail-section"><h3>特典</h3><div class="owned-grid">${
      p.bonuses.map(b=>`<div class="owned-card"><b>${esc(b.name||"特典")}</b><div class="small-muted">${esc(b.condition||"")}</div><div class="small-muted">所持 ${b.owned||0} / 欲しい ${b.wanted||0}</div><div class="small-muted">譲渡 ${b.transfer||0}${b.transferTo?` → ${esc(b.transferTo)}`:""}</div></div>`).join("")
    }</div></section>`;
  }
  $("detailContent").innerHTML=`<div class="detail-hero">${img}<div class="detail-main"><div class="series">${esc(p.series||"未分類")}</div><h2>${esc(p.title)}</h2><div class="detail-price">${fmt(p.price)}</div><div class="meta-row"><span class="badge">${statusLabel[p.status]}</span>${p.isRandom?`<span class="badge">ランダム</span>`:""}</div></div></div>
    <section class="detail-section"><h3>販売・発送</h3><dl class="kv">
      <dt>ショップ</dt><dd>${esc(p.shop||"—")}</dd><dt>受注期間</dt><dd>${p.orderStart||"—"} ～ ${p.orderEnd||"—"}</dd>
      <dt>予約締切</dt><dd>${p.reserveDeadline||"—"}</dd><dt>発売日</dt><dd>${p.releaseDate||"—"}</dd>
      <dt>発送予定</dt><dd>${esc(p.shippingText||"—")}</dd><dt>注文番号</dt><dd>${esc(p.orderNumber||"—")}</dd>
      <dt>欲しい数</dt><dd>${p.wantedQty||0}</dd><dt>購入数</dt><dd>${p.purchasedQty||0}</dd>
      <dt>購入合計</dt><dd>${fmt(productTotal(p))}</dd>
    </dl>${p.url?`<p><a href="${esc(p.url)}" target="_blank" rel="noopener">商品ページを開く ↗</a></p>`:""}</section>
    ${variants}${bonuses}
    ${p.notes?`<section class="detail-section"><h3>メモ</h3><p>${esc(p.notes).replace(/\n/g,"<br>")}</p></section>`:""}`;
  $("detailDialog").showModal();
}

$("addBtn").onclick=openAdd;
$("closeProductDialog").onclick=()=>$("productDialog").close();
$("closeDetailDialog").onclick=()=>$("detailDialog").close();
$("closeSettingsDialog").onclick=()=>$("settingsDialog").close();
$("settingsBtn").onclick=()=>$("settingsDialog").showModal();
$("addVariantBtn").onclick=()=>addVariantRow();
$("addBonusBtn").onclick=()=>addBonusRow();
$("isRandom").onchange=toggleSections;$("hasBonus").onchange=toggleSections;
["variantCount","favCount","purchaseLimit","randomMode"].forEach(id=>$(id).addEventListener("input",updateProbability));
$("imageInput").onchange=(e)=>{
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader(); r.onload=()=>{editingImageData=r.result;$("imagePreview").src=r.result;$("imagePreview").classList.remove("hidden");$("imagePlaceholder").classList.add("hidden")};r.readAsDataURL(f);
};
$("productForm").onsubmit=(e)=>{
  e.preventDefault(); const p=formProduct(); if(!p.title)return;
  const i=state.products.findIndex(x=>x.id===p.id); if(i>=0)state.products[i]=p; else state.products.push(p);
  save(); $("productDialog").close(); render();
};
$("deleteBtn").onclick=()=>{
  const id=$("productId").value;if(!id)return;
  if(confirm("この商品を削除しますか？")){state.products=state.products.filter(p=>p.id!==id);save();$("productDialog").close();render();}
};
$("editFromDetail").onclick=()=>{const id=currentDetailId;$("detailDialog").close();openEdit(id)};
$("searchInput").oninput=e=>{state.search=e.target.value;renderProducts()};
$("sortSelect").onchange=e=>{state.sort=e.target.value;renderProducts()};
document.querySelectorAll(".seg").forEach(b=>b.onclick=()=>{document.querySelectorAll(".seg").forEach(x=>x.classList.remove("active"));b.classList.add("active");state.listFilter=b.dataset.listFilter;renderProducts()});
document.querySelectorAll(".summary-card[data-filter-status]").forEach(b=>b.onclick=()=>{state.statusFilter=b.dataset.filterStatus;renderProducts()});
$("clearFilterBtn").onclick=()=>{state.statusFilter=null;state.search="";$("searchInput").value="";state.listFilter="all";document.querySelectorAll(".seg").forEach(x=>x.classList.toggle("active",x.dataset.listFilter==="all"));renderProducts()};
document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>{state.view=b.dataset.view;state.statusFilter=null;render()});
$("exportBtn").onclick=()=>{
  const blob=new Blob([JSON.stringify({version:1,products:state.products},null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`oshi-goods-backup-${todayISO()}.json`;a.click();URL.revokeObjectURL(a.href);
};
$("importInput").onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  try{const data=JSON.parse(await f.text());if(!Array.isArray(data.products))throw new Error();state.products=data.products;save();render();alert("読み込みました");}
  catch{alert("読み込みに失敗しました");}
};

load(); render();
