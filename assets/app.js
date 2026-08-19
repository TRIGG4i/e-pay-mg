const CONFIG={
  visaApiUrls:["https://usa.visa.com/cmsapi/fx/rates","https://www.visa.com/cmsapi/fx/rates"],
  destinationCurrency:"MGA",
  clientVisaBankFeePercent:4,
  ownerVisaBankFeePercent:3.5,
  clientCardFeePercent:3,
  clientFixedVisaFeeMGA:4500,
  bankCurrencyFeePercent:4.45,
  officeMobileMoneyFeePercent:2.5,
  ownerFixedFeeMGA:1000,
  skrillFeePercent:1,
  cryptoFeePercent:1,
  commissionTiers:[{maxExclusive:351,percent:4.99},{maxExclusive:501,percent:3.99},{maxExclusive:Infinity,percent:2.99}],
  fallbackClientRates:{EUR:5053.77,USD:4308.42},
  fallbackOwnerRates:{EUR:5029.47,USD:4288.00}
};

const savedRates=(()=>{try{return JSON.parse(localStorage.getItem("epayAppRates")||"{}")}catch{return {}}})();
const state={
  view:"client",currency:"EUR",transferType:"bank",
  clientRates:savedRates?.clientRates||{...CONFIG.fallbackClientRates},
  ownerRates:savedRates?.ownerRates||{...CONFIG.fallbackOwnerRates},
  ratesDate:savedRates?.date||null,
  quotes:(()=>{try{return JSON.parse(localStorage.getItem("epayQuotesV2")||"[]")}catch{return []}})(),
  editingQuoteId:null,
  editingQuoteBase:null,
  draftNumber:null
};

const $=id=>document.getElementById(id);
const $$=s=>Array.from(document.querySelectorAll(s));
const roundUpTo=(v,u)=>Math.ceil(v/u)*u;
const cleanNumberText=v=>String(v||"").replace(/[\s\u00A0\u202F]/g,"").replace(/[^0-9.,-]/g,"").replace(/,/g,".");
const parseInput=id=>{const n=Number(cleanNumberText($(id)?.value));return Number.isFinite(n)?n:0};
const fmtNumber=(v,d=0)=>Number.isFinite(v)?new Intl.NumberFormat("fr-FR",{minimumFractionDigits:d,maximumFractionDigits:d}).format(v):"—";
const fmtMGA=(v,d=0)=>Number.isFinite(v)?fmtNumber(v,d)+" MGA":"—";
const fmtCurrency=(v,c,d=0)=>Number.isFinite(v)?fmtNumber(v,d)+" "+c:"—";
const fmtRate=v=>Number.isFinite(v)?fmtNumber(v,2)+" MGA":"—";
const escapeHTML=s=>String(s??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

function formatInputValue(value){
  const raw=String(value||"").replace(/[\s\u00A0\u202F]/g,"").replace(/[^0-9.,]/g,"");
  if(!raw)return "";
  const m=raw.match(/[.,]/),i=m?m.index:-1;
  let intPart=(m?raw.slice(0,i):raw).replace(/\D/g,"");
  let decPart=(m?raw.slice(i+1):"").replace(/[.,\D]/g,"").slice(0,2);
  const formatted=intPart?new Intl.NumberFormat("fr-FR",{maximumFractionDigits:0}).format(Number(intPart)):"0";
  return m?`${formatted},${decPart}`:formatted;
}
function bindFormattedInput(id){const el=$(id);el.addEventListener("input",()=>{el.value=formatInputValue(el.value);refreshAll()});el.value=formatInputValue(el.value)}
function getCommissionPercent(amount){return CONFIG.commissionTiers.find(t=>amount<t.maxExclusive)?.percent??2.99}

function calculateClientTotals(amount,currency,transferType){
  const rate=state.clientRates[currency];
  if(!Number.isFinite(rate)||rate<=0||amount<=0)return null;
  const commission=amount*getCommissionPercent(amount)/100;
  const bankCurrencyFee=(amount+commission)*CONFIG.bankCurrencyFeePercent/100;
  const foreignSubtotal=amount+commission+bankCurrencyFee;
  const mgaSubtotal=foreignSubtotal*rate;
  const visaFee=mgaSubtotal*CONFIG.clientCardFeePercent/100+CONFIG.clientFixedVisaFeeMGA;
  const bankTotal=roundUpTo(mgaSubtotal+visaFee,1000);
  const cashFee=roundUpTo(bankTotal*CONFIG.officeMobileMoneyFeePercent/100,100);
  const cashTotal=roundUpTo(bankTotal+cashFee,1000);
  const selectedTotal=transferType==="cash"?cashTotal:bankTotal;
  const selectedFeeMGA=selectedTotal-(amount*rate);
  const includedFeesCurrency=Math.max(0,selectedFeeMGA/rate);
  return{rate,commission,bankCurrencyFee,foreignSubtotal,mgaSubtotal,visaFee,bankTotal,cashFee,cashTotal,selectedTotal,includedFeesCurrency};
}

function calculateOwnerTotals(amount,currency){
  const rate=state.ownerRates[currency];
  if(!Number.isFinite(rate)||rate<=0||amount<=0)return null;
  const totalToBuy=amount/((1-CONFIG.skrillFeePercent/100)*(1-CONFIG.cryptoFeePercent/100));
  const skrillFee=totalToBuy*CONFIG.skrillFeePercent/100;
  const afterSkrill=totalToBuy-skrillFee;
  const cryptoFee=afterSkrill*CONFIG.cryptoFeePercent/100;
  const debitMGA=totalToBuy*rate+CONFIG.ownerFixedFeeMGA;
  const clientBank=calculateClientTotals(amount,currency,"bank")?.bankTotal;
  const netProfit=Number.isFinite(clientBank)?clientBank-debitMGA:NaN;
  return{rate,totalToBuy,skrillFee,cryptoFee,debitMGA,clientBank,netProfit};
}

function maxSendableFromBudget(budget,currency,transferType){
  if(!Number.isFinite(budget)||budget<=0)return 0;
  let low=0,high=Math.max(1,budget/Math.max(1,state.clientRates[currency]));
  let guard=0;
  while((calculateClientTotals(high,currency,transferType)?.selectedTotal||Infinity)<budget&&guard++<40)high*=2;
  for(let i=0;i<50;i++){const mid=(low+high)/2,total=calculateClientTotals(mid,currency,transferType)?.selectedTotal||Infinity;if(total<=budget)low=mid;else high=mid}
  return Math.floor(low);
}

function applyCurrencyUI(){
  $$(".rate-option").forEach(b=>b.classList.toggle("active",b.dataset.currency===state.currency));
  const isEUR=state.currency==="EUR";
  ["clientCurrencyDot","internalCurrencyDot"].forEach(id=>$(id).className="currency-dot "+(isEUR?"eur":"usd"));
  ["clientCurrencyCode","clientCurrencyHint","internalCurrencyCode","internalCurrencyHint"].forEach(id=>$(id).textContent=state.currency);
}

function updateRateStrip(){
  const rates=state.view==="internal"?state.ownerRates:state.clientRates;
  $("rateEUR").textContent=fmtNumber(rates.EUR,2);
  $("rateUSD").textContent=fmtNumber(rates.USD,2);
}

function updateClient(){
  const amount=parseInput("clientAmount"),t=calculateClientTotals(amount,state.currency,state.transferType);
  $("commissionChip").textContent=amount>0?`Commission ${fmtNumber(getCommissionPercent(amount),2)}%`:"—";
  $$(".segment").forEach(b=>b.classList.toggle("active",b.dataset.transferType===state.transferType));
  if(!t){$("clientTotal").textContent=$("clientRateMeta").textContent=$("clientFeesMeta").textContent="—"}
  else{
    $("clientTotal").textContent=fmtNumber(t.selectedTotal,0);
    $("clientRateMeta").textContent=`1 ${state.currency} = ${fmtNumber(t.rate,2)} MGA`;
    $("clientFeesMeta").textContent=fmtCurrency(t.includedFeesCurrency,state.currency,2);
  }
  const budget=parseInput("budgetAmount");
  $("budgetBank").textContent=fmtCurrency(maxSendableFromBudget(budget,state.currency,"bank"),state.currency,0);
  $("budgetCash").textContent=fmtCurrency(maxSendableFromBudget(budget,state.currency,"cash"),state.currency,0);
  if($("quoteSheet").classList.contains("open")&&!state.editingQuoteId)renderDraftPreview();
}

function updateInternal(){
  const amount=parseInput("internalAmount"),t=calculateOwnerTotals(amount,state.currency);
  if(!t){["internalDebit","internalBuy","internalRate","netProfit","clientBank","skrillFee","cryptoFee"].forEach(id=>$(id).textContent="—");return}
  $("internalDebit").textContent=fmtNumber(t.debitMGA,0);
  $("internalBuy").textContent=fmtCurrency(t.totalToBuy,state.currency,2);
  $("internalRate").textContent=fmtRate(t.rate);
  $("netProfit").textContent=fmtMGA(t.netProfit,0);
  $("clientBank").textContent=fmtMGA(t.clientBank,0);
  $("skrillFee").textContent=fmtCurrency(t.skrillFee,state.currency,2);
  $("cryptoFee").textContent=fmtCurrency(t.cryptoFee,state.currency,2);
  $("ownerFixedFee").textContent=fmtMGA(CONFIG.ownerFixedFeeMGA,0);
}

function refreshAll(){applyCurrencyUI();updateRateStrip();updateClient();updateInternal();renderQuotes()}
function setView(view){
  state.view=view;
  $$(".view").forEach(v=>v.classList.toggle("active",v.id===view+"View"));
  $$(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  updateRateStrip();
}

function todayVisaDate(){const d=new Date();return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`}
function normaliseVisaRate(n){if(!Number.isFinite(n)||n<=0)return NaN;if(n>=100&&n<=30000)return n;if(n>0&&n<.01){const inv=1/n;if(inv>=100&&inv<=30000)return inv}return NaN}
function toNumbers(v){if(typeof v==="number")return[v];if(v==null)return[];return((String(v).replace(/\s/g,"").replace(/,/g,"").match(/-?\d+(?:\.\d+)?/g)||[]).map(Number).filter(Number.isFinite))}
function findByKeyRecursive(o,key,res=[]){if(!o||typeof o!=="object")return res;for(const[k,v]of Object.entries(o)){if(k===key)res.push(v);if(v&&typeof v==="object")findByKeyRecursive(v,key,res)}return res}
function extractVisaRate(data){
  const keys=["fxRateWithAdditionalFee","rateWithAdditionalFee","conversionRateWithAdditionalFee","cardholderBillingAmount","destinationAmountWithAdditionalFee","convertedAmountWithAdditionalFee","toAmountWithAdditionalFee","amountWithAdditionalFee","fxRate","conversionRate","rate","destinationAmount","convertedAmount","toAmount","result"];
  for(const key of keys)for(const value of findByKeyRecursive(data,key)){const c=toNumbers(value).map(normaliseVisaRate).find(Number.isFinite);if(c)return c}
  throw new Error("Taux VISA introuvable");
}
function buildVisaUrl(baseUrl,fromCurrency,bankFeePercent){const p=new URLSearchParams({amount:"1",fee:String(bankFeePercent),utcConvertedDate:todayVisaDate(),exchangedate:todayVisaDate(),fromCurr:CONFIG.destinationCurrency,toCurr:fromCurrency});return `${baseUrl}?${p}`}
async function fetchVisaRate(fromCurrency,bankFeePercent){let last;for(const url of CONFIG.visaApiUrls){try{const r=await fetch(buildVisaUrl(url,fromCurrency,bankFeePercent),{method:"GET",mode:"cors",cache:"no-store",headers:{Accept:"application/json, text/plain, */*"}});if(!r.ok)throw new Error("Réponse VISA invalide");const rate=extractVisaRate(await r.json());if(!Number.isFinite(rate)||rate<100)throw new Error("Taux incohérent");return rate}catch(e){last=e}}throw last||new Error("VISA indisponible")}

async function refreshVisa(){
  const dot=$("rateDot"),statusDot=$("statusDot");dot.className="rate-dot loading";statusDot.className="status-dot";$("rateStatus").textContent="Actualisation VISA…";$("refreshRates").disabled=true;
  try{
    const [cEUR,cUSD,oEUR,oUSD]=await Promise.all([fetchVisaRate("EUR",CONFIG.clientVisaBankFeePercent),fetchVisaRate("USD",CONFIG.clientVisaBankFeePercent),fetchVisaRate("EUR",CONFIG.ownerVisaBankFeePercent),fetchVisaRate("USD",CONFIG.ownerVisaBankFeePercent)]);
    state.clientRates={EUR:cEUR,USD:cUSD};state.ownerRates={EUR:oEUR,USD:oUSD};state.ratesDate=new Date().toISOString();
    localStorage.setItem("epayAppRates",JSON.stringify({date:state.ratesDate,clientRates:state.clientRates,ownerRates:state.ownerRates}));
    dot.className="rate-dot";statusDot.className="status-dot";$("rateStatus").textContent="Taux VISA actualisés à l'instant";
  }catch(e){dot.className="rate-dot error";statusDot.className="status-dot warn";$("rateStatus").textContent="VISA indisponible, taux sauvegardés conservés"}
  finally{$("refreshRates").disabled=false;refreshAll()}
}

function nextQuoteNumber(){
  const date=new Date(),key=`${date.getFullYear()}${String(date.getMonth()+1).padStart(2,"0")}${String(date.getDate()).padStart(2,"0")}`;
  const storeKey="epayQuoteSequenceV2";let data={};try{data=JSON.parse(localStorage.getItem(storeKey)||"{}")}catch{}
  data[key]=(data[key]||0)+1;localStorage.setItem(storeKey,JSON.stringify(data));
  return `EP-${key}-${String(data[key]).padStart(3,"0")}`;
}
function isoDate(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function displayDate(v){if(!v)return"—";const d=new Date(v+"T12:00:00");return new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}).format(d)}
function defaultValidity(){const d=new Date();d.setDate(d.getDate()+1);return isoDate(d)}
function makeId(){return globalThis.crypto?.randomUUID?.()||`q-${Date.now()}-${Math.random().toString(36).slice(2,8)}`}

function currentDraft(){
  const base=state.editingQuoteBase;
  const amount=base?.amount??parseInput("clientAmount");
  const currency=base?.currency??state.currency;
  const transferType=base?.transferType??state.transferType;
  const t=base?null:calculateClientTotals(amount,currency,transferType);
  return{
    id:state.editingQuoteId||makeId(),
    number:state.draftNumber||nextQuoteNumber(),
    createdAt:base?.createdAt||isoDate(),client:$("quoteClient").value.trim(),phone:$("quotePhone").value.trim(),validUntil:$("quoteValidity").value||defaultValidity(),note:$("quoteNote").value.trim(),
    amount,currency,transferType,rate:base?.rate??t?.rate??0,includedFeesCurrency:base?.includedFeesCurrency??t?.includedFeesCurrency??0,totalMGA:base?.totalMGA??t?.selectedTotal??0
  };
}

function quoteMode(q){return q.transferType==="cash"?"Espèces / Mobile Money":"Dépôt bancaire"}
function fillPreview(q){
  $("previewNumber").textContent=q.number;$("previewDate").textContent=`Émis le ${displayDate(q.createdAt)}`;$("previewClient").textContent=q.client||"Client non renseigné";
  $("previewSend").textContent=fmtNumber(q.amount,2);$("previewCurrency").textContent=q.currency;$("previewMode").textContent=quoteMode(q);$("previewRate").textContent=`1 ${q.currency} = ${fmtNumber(q.rate,2)} MGA`;
  $("previewTotal").textContent=fmtMGA(q.totalMGA,0);
  $("previewNote").textContent=q.note||`Le montant inclut les frais applicables. Devis valable jusqu'au ${displayDate(q.validUntil)}.`;
}
function renderDraftPreview(){if(!state.draftNumber)state.draftNumber=nextQuoteNumber();fillPreview(currentDraft())}

function openQuote(q=null){
  if(q){
    state.editingQuoteId=q.id;state.editingQuoteBase={...q};state.draftNumber=q.number;$("quoteClient").value=q.client||"";$("quotePhone").value=q.phone||"";$("quoteValidity").value=q.validUntil||defaultValidity();$("quoteNote").value=q.note||"";
    state.currency=q.currency;state.transferType=q.transferType;$("clientAmount").value=formatInputValue(String(q.amount));
    $("quoteSheetTitle").textContent="Devis "+q.number;$("deleteCurrentQuote").style.display="flex";
  }else{
    state.editingQuoteId=null;state.editingQuoteBase=null;state.draftNumber=nextQuoteNumber();$("quoteClient").value="";$("quotePhone").value="";$("quoteValidity").value=defaultValidity();$("quoteNote").value="";$("quoteSheetTitle").textContent="Nouveau devis";$("deleteCurrentQuote").style.display="none";
  }
  $("quoteSheetSub").textContent="Compléter le client puis enregistrer ou imprimer";$("quoteSheet").classList.add("open");document.body.style.overflow="hidden";refreshAll();renderDraftPreview();setTimeout(()=>$("quoteClient").focus(),180);
}
function closeQuote(){$("quoteSheet").classList.remove("open");document.body.style.overflow="";state.editingQuoteId=null;state.editingQuoteBase=null;state.draftNumber=null}

function persistQuotes(){localStorage.setItem("epayQuotesV2",JSON.stringify(state.quotes))}
function saveCurrentQuote(){
  const q=currentDraft();
  if(q.totalMGA<=0){$("quoteSheetSub").textContent="Saisis d'abord un montant valide.";return}
  const idx=state.quotes.findIndex(x=>x.id===q.id);
  if(idx>=0)state.quotes[idx]=q;else state.quotes.unshift(q);
  state.quotes=state.quotes.slice(0,100);persistQuotes();state.editingQuoteId=q.id;state.editingQuoteBase={...q};$("quoteSheetTitle").textContent="Devis "+q.number;$("quoteSheetSub").textContent="Enregistré sur cet appareil";$("deleteCurrentQuote").style.display="flex";renderQuotes();
}

function renderQuotes(){
  const box=$("quotesContainer");if(!box)return;
  if(!state.quotes.length){box.innerHTML=`<div class="quotes-empty"><div class="empty-orb"><svg class="icon lg"><use href="#i-file"/></svg></div><h3>Aucun devis</h3><p>Crée un devis depuis le calcul client. Il apparaîtra ici pour être réouvert ou imprimé.</p><button class="secondary" data-new-quote><svg class="icon sm"><use href="#i-plus"/></svg>Nouveau devis</button></div>`;return}
  box.innerHTML=`<div class="quote-list">${state.quotes.map(q=>`<div class="quote-item" data-open-quote="${escapeHTML(q.id)}"><div class="quote-icon"><svg class="icon"><use href="#i-file"/></svg></div><div class="quote-main"><strong>${escapeHTML(q.client||q.number)}</strong><span>${escapeHTML(q.number)} · ${escapeHTML(displayDate(q.createdAt))}</span><div class="quote-actions"><button class="mini-btn" data-print-id="${escapeHTML(q.id)}" aria-label="Imprimer"><svg class="icon sm"><use href="#i-print"/></svg></button><button class="mini-btn danger" data-delete-id="${escapeHTML(q.id)}" aria-label="Supprimer"><svg class="icon sm"><use href="#i-trash"/></svg></button></div></div><div class="quote-amount">${escapeHTML(fmtMGA(q.totalMGA,0))}</div></div>`).join("")}</div>`;
}

function quoteText(q){return `DEVIS ${q.number}\nClient : ${q.client||"—"}${q.phone?`\nTéléphone : ${q.phone}`:""}\nMontant à envoyer : ${fmtCurrency(q.amount,q.currency,2)}\nMode : ${quoteMode(q)}\nTaux : 1 ${q.currency} = ${fmtNumber(q.rate,2)} MGA\nTotal à payer : ${fmtMGA(q.totalMGA,0)}\nValable jusqu'au : ${displayDate(q.validUntil)}${q.note?`\nNote : ${q.note}`:""}`}
async function copyCurrentQuote(){const q=currentDraft();try{await navigator.clipboard.writeText(quoteText(q));$("quoteSheetSub").textContent="Devis copié dans le presse-papiers"}catch{$("quoteSheetSub").textContent="Copie indisponible sur ce navigateur"}}

function renderPrint(q){
  $("printStage").innerHTML=`<article class="print-page"><header class="print-head"><div class="print-brand"><svg viewBox="0 0 64 64"><rect x="3" y="3" width="58" height="58" rx="18" fill="#0B0D12"/><path d="M20 18v28M20 18h22M20 32h17M20 46h22" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/><path d="m37.5 26.5 7 5.5-7 5.5" fill="none" stroke="#5B78FF" stroke-width="4.3" stroke-linecap="round" stroke-linejoin="round"/></svg><div><strong>E-Pay MG</strong><span>Devis de transfert</span></div></div><div class="print-title"><h1>DEVIS</h1><p>${escapeHTML(q.number)} · ${escapeHTML(displayDate(q.createdAt))}</p></div></header><section class="print-client"><div class="print-block"><span>Client</span><strong>${escapeHTML(q.client||"Client non renseigné")}${q.phone?`<br>${escapeHTML(q.phone)}`:""}</strong></div><div class="print-block"><span>Validité</span><strong>Valable jusqu'au ${escapeHTML(displayDate(q.validUntil))}</strong></div></section><table class="print-table"><thead><tr><th>Description</th><th>Détail</th><th>Montant</th></tr></thead><tbody><tr><td>Transfert ${escapeHTML(q.currency)}</td><td>${escapeHTML(quoteMode(q))}</td><td>${escapeHTML(fmtCurrency(q.amount,q.currency,2))}</td></tr><tr><td>Taux appliqué</td><td>1 ${escapeHTML(q.currency)}</td><td>${escapeHTML(fmtNumber(q.rate,2))} MGA</td></tr><tr><td>Frais inclus</td><td>Commission et frais de traitement</td><td>${escapeHTML(fmtCurrency(q.includedFeesCurrency,q.currency,2))}</td></tr></tbody></table><div class="print-total"><span>Total à payer</span><strong>${escapeHTML(fmtMGA(q.totalMGA,0))}</strong></div>${q.note?`<p class="print-note"><strong>Note :</strong> ${escapeHTML(q.note)}</p>`:""}<footer class="print-footer"><span>E-Pay MG · Devis généré électroniquement</span><span>${escapeHTML(q.number)}</span></footer></article>`;
}
function printAnyQuote(q){if(!q||!q.totalMGA)return;renderPrint(q);setTimeout(()=>window.print(),60)}

$$(".rate-option").forEach(b=>b.addEventListener("click",()=>{state.currency=b.dataset.currency;refreshAll()}));
$$(".segment").forEach(b=>b.addEventListener("click",()=>{state.transferType=b.dataset.transferType;refreshAll()}));
$$(".nav-btn").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
["clientAmount","internalAmount","budgetAmount"].forEach(bindFormattedInput);
$("refreshRates").addEventListener("click",refreshVisa);
$("openQuote").addEventListener("click",()=>openQuote());
$("newQuoteTop").addEventListener("click",()=>openQuote());
$("closeQuote").addEventListener("click",closeQuote);
$("quoteSheet").addEventListener("click",e=>{if(e.target===$("quoteSheet"))closeQuote()});
["quoteClient","quotePhone","quoteValidity","quoteNote"].forEach(id=>$(id).addEventListener("input",renderDraftPreview));
$("saveQuote").addEventListener("click",saveCurrentQuote);
$("copyQuote").addEventListener("click",copyCurrentQuote);
$("printQuote").addEventListener("click",()=>printAnyQuote(currentDraft()));
$("deleteCurrentQuote").addEventListener("click",()=>{if(!state.editingQuoteId||!confirm("Supprimer définitivement ce devis ?"))return;state.quotes=state.quotes.filter(q=>q.id!==state.editingQuoteId);persistQuotes();closeQuote();setView("quotes");renderQuotes()});
$("quotesContainer").addEventListener("click",e=>{
  const n=e.target.closest("[data-new-quote]");if(n){openQuote();return}
  const del=e.target.closest("[data-delete-id]");if(del){e.stopPropagation();if(!confirm("Supprimer définitivement ce devis ?"))return;state.quotes=state.quotes.filter(q=>q.id!==del.dataset.deleteId);persistQuotes();renderQuotes();return}
  const pr=e.target.closest("[data-print-id]");if(pr){e.stopPropagation();printAnyQuote(state.quotes.find(q=>q.id===pr.dataset.printId));return}
  const row=e.target.closest("[data-open-quote]");if(row){const q=state.quotes.find(q=>q.id===row.dataset.openQuote);if(q)openQuote(q)}
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("quoteSheet").classList.contains("open"))closeQuote()});

$("todayLabel").textContent=new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"short"}).format(new Date()).replace(/^./,c=>c.toUpperCase());
if(state.ratesDate){const d=new Date(state.ratesDate);if(!Number.isNaN(d.valueOf()))$("rateStatus").textContent=`Taux sauvegardés · ${new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"2-digit"}).format(d)}`}
$("quoteValidity").value=defaultValidity();
refreshAll();
