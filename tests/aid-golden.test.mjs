import fs from "node:fs";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const html = fs.readFileSync("index.html", "utf8");

function makeDom() {
  return new JSDOM(html, {runScripts:"dangerously", url:"https://example.test/"});
}
function clickByText(nodes,text){
  const el=[...nodes].find(x=>x.textContent.trim()===text);
  assert.ok(el,`Hittade inte UI-val: ${text}`); el.click();
}
function selectContext(dom,context){
  const d=dom.window.document;
  (context==="pregnancy"?d.querySelector("#choosePregnancy"):d.querySelector("#chooseStandard")).click();
}
function selectPump(dom,pump){
  const d=dom.window.document,s=d.querySelector("#pump");
  s.value=pump; s.dispatchEvent(new dom.window.Event("change",{bubbles:true}));
}
function selectPhase(dom,phase){
  const d=dom.window.document,s=d.querySelector("#phase");
  s.value=phase; s.dispatchEvent(new dom.window.Event("change",{bubbles:true}));
}
function selectPattern(dom,pattern){
  const d=dom.window.document;
  const map={
    fastLow:["Fasta","Lågt"], fastHigh:["Fasta","Högt"],
    mealHighTransient:["Måltid","Övergående topp"], mealHighPersistent:["Måltid","Kvarstående topp"],
    lateHigh:["Måltid","Sen topp"], mealLow:["Måltid","Lågt efter mat"],
    exerciseLow:["Aktivitet","Lågt vid/efter aktivitet"]
  };
  const [cat,item]=map[pattern]; clickByText(d.querySelectorAll(".catbtn"),cat);
  if(cat==="Måltid"){
    const card=[...d.querySelectorAll(".curve-card")].find(x=>x.getAttribute("aria-label")===item);
    assert.ok(card,`Hittade inte måltidsmönster: ${item}`); card.click();
  } else clickByText(d.querySelectorAll(".patbtn"),item);
}
function actionText(el){
  const title=el.querySelector(".action-title");
  if(!title) return el.textContent.trim();
  const clone=title.cloneNode(true); clone.querySelector("button")?.remove();
  return clone.textContent.trim();
}
function snapshot({context="standard",pump,phase="early",pattern}){
  const dom=makeDom(); selectContext(dom,context); selectPump(dom,pump);
  if(context==="pregnancy") selectPhase(dom,phase); selectPattern(dom,pattern);
  const d=dom.window.document, pregOpt=d.querySelector("#pregOpt"), phaseNote=d.querySelector("#pregPhaseNote");
  return {
    actions:[...d.querySelectorAll("#actions .act")].map(actionText),
    menus:[...d.querySelectorAll("#actions .actmeta")].map(x=>x.textContent.trim()),
    notes:[...d.querySelectorAll("#actions .action-note")].map(x=>x.textContent.trim()),
    icons:[...d.querySelectorAll("#actions .act")].map(x=>!!x.querySelector("svg.action-icon")),
    metaIconCount:d.querySelectorAll("#actions .actmeta svg").length,
    pregSummary:d.querySelector("#pregOptSummary")?.textContent.trim()||"",
    pregStatus:d.querySelector("#pregOptStatus")?.textContent.trim()||"",
    pregDetail:d.querySelector("#pregOptText")?.textContent.trim()||"",
    pregVisible:!pregOpt?.classList.contains("hidden"),
    phaseNote:phaseNote?.textContent.trim()||"",
    phaseNoteVisible:!phaseNote?.classList.contains("hidden"),
    hypoVisible:!d.querySelector("#hypoTreatment")?.classList.contains("hidden")
  };
}
function renderedText(g){return [...g.actions,...g.menus,...g.notes,g.pregSummary,g.pregStatus,g.pregDetail,g.phaseNote].join("\n");}
function expectedIcon(title,menu=""){
  const t=title.toLowerCase(), m=menu.toLowerCase();
  return t.includes('starta "aktivitet"')||t.includes('starta "träning"')||t.includes('starta "temp mål"')||t.includes('starta "ease-off"')||
    t.includes('kh-kvot')||t.includes('insulin-till-kolhydrat')||t.includes('omvänd korrektion')||t.includes('falska kh')||
    t.includes('förlängd bolus')||t.includes('långsamt absorberad måltid')||m.includes('bolus wizard')||m.includes('boluskalkylator');
}
function assertCase(g,got){
  assert.deepEqual(got.actions,g.actions,`${g.name}: fel åtgärdsordning`);
  if(g.hypoVisible!==undefined) assert.equal(got.hypoVisible,g.hypoVisible,`${g.name}: fel hyporuta`);
  for(const forbidden of g.mustNotInclude||[]) assert.ok(!renderedText(got).includes(forbidden),`${g.name}: får inte innehålla ${forbidden}`);
}

const E={
 standard:{
  omnipod:{fastLow:["Höj målglukos i relevant segment"],fastHigh:["Sänk målglukos om >6,1 mmol/L"],mealHighTransient:[],mealHighPersistent:["Stärk KH-kvot ≈10–20 %","Omvänd korrektion AV vid bolusreduktion under mål"],lateHigh:["Stärk KH-kvot ≈10–20 %"],mealLow:["Försvaga KH-kvot ≈10–20 %","Omvänd korrektion PÅ vid måltidsstart under mål"],exerciseLow:["Starta \"Aktivitet\" 1–2 h före aktivitet som brukar sänka glukos"]},
  tandem:{fastLow:["Minska relevant basal ≈10–20 %","Om korrektionsdriven: försvaga ISF ≈10–20 %"],fastHigh:["Öka relevant basal ≈10–20 %","Om korrektionsdriven: stärk ISF ≈10–20 %"],mealHighTransient:[],mealHighPersistent:["Stärk KH-kvot ≈10–20 %"],lateHigh:["Stärk KH-kvot ≈10–20 %","Förlängd bolus vb"],mealLow:["Försvaga KH-kvot ≈10–20 %"],exerciseLow:["Starta \"Träning\" 1–2 h före aktivitet som brukar sänka glukos"]},
  medtronic:{fastLow:["Höj SmartGuard-målet"],fastHigh:["Sätt SmartGuard-mål 5,5 mmol/L","Sätt AIT 2 h"],mealHighTransient:[],mealHighPersistent:["Stärk KH-kvot ≈10–20 %"],lateHigh:["Stärk KH-kvot ≈10–20 %"],mealLow:["Försvaga KH-kvot ≈10–20 %"],exerciseLow:["Starta \"Temp mål\" 1–2 h före aktivitet som brukar sänka glukos"]},
  camaps:{fastLow:["Höj personligt målglukos i aktuellt segment"],fastHigh:["Sänk personligt målglukos"],mealHighTransient:[],mealHighPersistent:["Stärk KH-kvot ≈10–20 %"],lateHigh:["Stärk KH-kvot ≈10–20 %","Långsamt absorberad måltid vb"],mealLow:["Försvaga KH-kvot ≈10–20 %","Vid sen hypo: höj personligt målglukos i relevant segment"],exerciseLow:["Starta \"Ease-off\" 1–2 h före aktivitet som brukar sänka glukos"]}
 },
 pregnancy:{
  tandem:{fastLow:["Minska relevant basal ≈10–20 %","Om korrektionsdriven: försvaga ISF ≈10–20 %"],fastHigh:["Öka relevant basal ≈10–20 %","Stärk ISF ≈10–20 %"],mealHighTransient:[],mealHighPersistent:["Stärk KH-kvot ≈10–20 %"],lateHigh:["Stärk KH-kvot ≈10–20 %","Förlängd bolus vb"],mealLow:["Försvaga KH-kvot ≈10–20 %"],exerciseLow:["Starta \"Träning\" 1–2 h före aktivitet som brukar sänka glukos"]},
  medtronic:{fastLow:["Höj SmartGuard-målet"],fastHigh:[],mealHighTransient:[],mealHighPersistent:["Stärk KH-kvot ≈10–20 %"],lateHigh:["Stärk KH-kvot ≈10–20 %"],mealLow:["Försvaga KH-kvot ≈10–20 %"],exerciseLow:["Starta \"Temp mål\" 1–2 h före aktivitet som brukar sänka glukos"]},
  camaps:{fastLow:["Höj personligt målglukos i aktuellt segment"],fastHigh:[],mealHighTransient:[],mealHighPersistent:["Stärk KH-kvot ≈10–20 %"],lateHigh:["Stärk KH-kvot ≈10–20 %","Långsamt absorberad måltid vb"],mealLow:["Försvaga KH-kvot ≈10–20 %","Vid sen hypo: höj personligt målglukos i relevant segment"],exerciseLow:["Starta \"Ease-off\" 1–2 h före aktivitet som brukar sänka glukos"]},
  omnipod:{
   early:{fastLow:["Höj målglukos i relevant segment"],fastHigh:["Säkerställ målglukos 6,1 mmol/L","Överväg manuellt nattläge med anpassad basal"],mealHighTransient:[],mealHighPersistent:["Stärk KH-kvot ≈10–20 %","Falska KH vb"],lateHigh:["Stärk KH-kvot ≈10–20 %","Falska KH vb"],mealLow:["Försvaga KH-kvot ≈10–20 %"],exerciseLow:["Starta \"Aktivitet\" 1–2 h före aktivitet som brukar sänka glukos"]},
   late:{fastLow:["Höj målglukos i relevant segment"],fastHigh:["Säkerställ målglukos 6,1 mmol/L","Överväg manuellt nattläge med anpassad basal"],mealHighTransient:[],mealHighPersistent:["Stärk KH-kvot ≈10–20 %","Omvänd korrektion AV vid bolusreduktion under mål","Falska KH vb"],lateHigh:["Stärk KH-kvot ≈10–20 %","Falska KH vb"],mealLow:["Försvaga KH-kvot ≈10–20 %","Omvänd korrektion PÅ vid måltidsstart under mål"],exerciseLow:["Starta \"Aktivitet\" 1–2 h före aktivitet som brukar sänka glukos"]}
  }
 }
};
function expectedActions(context,pump,phase,pattern){
  if(context==="standard") return E.standard[pump][pattern];
  if(pump==="omnipod") return E.pregnancy.omnipod[phase][pattern];
  return E.pregnancy[pump][pattern];
}
const pumps=["omnipod","tandem","medtronic","camaps"];
const patterns=["fastLow","fastHigh","mealHighTransient","mealHighPersistent","lateHigh","mealLow","exerciseLow"];
const lowPatterns=new Set(["fastLow","mealLow","exerciseLow"]);

// 52 independently enumerated release-critical golden cases.
const golden=[];
for(const pump of pumps) for(const pattern of patterns) golden.push({name:`${pump} standard ${pattern}`,in:{pump,pattern},actions:E.standard[pump][pattern],hypoVisible:lowPatterns.has(pattern)});
for(const phase of ["early","late"]) for(const pattern of patterns) golden.push({name:`omnipod sMVC ${phase} ${pattern}`,in:{context:"pregnancy",pump:"omnipod",phase,pattern},actions:E.pregnancy.omnipod[phase][pattern],hypoVisible:lowPatterns.has(pattern)});
for(const [pump,phase,pattern] of [
 ["tandem","early","fastLow"],["tandem","early","fastHigh"],["tandem","early","mealLow"],["tandem","late","exerciseLow"],
 ["medtronic","late","fastLow"],["medtronic","late","mealHighPersistent"],["medtronic","late","exerciseLow"],
 ["camaps","early","mealLow"],["camaps","late","mealLow"],["camaps","late","lateHigh"]
]) golden.push({name:`${pump} sMVC ${phase} ${pattern}`,in:{context:"pregnancy",pump,phase,pattern},actions:E.pregnancy[pump][pattern],hypoVisible:lowPatterns.has(pattern)});
assert.equal(golden.length,52,"Golden-case-uppsättningen ska innehålla 52 fall");
let passed=0;
for(const g of golden){assertCase(g,snapshot(g.in)); passed++;}

const pregnancySummary={
 omnipod:{early:"Mål 6,1 mmol/L · AID/manual-läge individualiseras",late:"Mål 6,1 mmol/L · AID/manual-läge individualiseras"},
 tandem:{early:"Sömnläge dygnet runt · CIRCUIT-strategi",late:"Sömnläge dygnet runt · CIRCUIT-strategi"},
 medtronic:{early:"SmartGuard-mål 5,5 mmol/L · AIT 2 h",late:"SmartGuard-mål 5,5 mmol/L · AIT 2 h"},
 camaps:{early:"Målglukos 5,5 mmol/L",late:"Mål 5,5 mmol/L · överväg 5,0 dag / 4,5 natt"}
};

// Exact 84-case behavior regression, phase-aware for sMVC.
let behaviorRegression=0;
for(const pump of pumps) for(const pattern of patterns) for(const context of ["standard","pregnancy"]) for(const phase of (context==="pregnancy"?["early","late"]:["early"])){
  const name=`${pump}/${context}/${phase}/${pattern}`, got=snapshot({context,pump,phase,pattern});
  assert.deepEqual(got.actions,expectedActions(context,pump,phase,pattern),`${name}: beteenderegression`);
  assert.equal(got.hypoVisible,lowPatterns.has(pattern),`${name}: fel hyporuta`);
  assert.equal(got.pregVisible,context==="pregnancy",`${name}: kontextisolering`);
  assert.equal(got.phaseNoteVisible,context==="pregnancy",`${name}: graviditetsfas synlighet`);
  if(context==="standard"){
    assert.equal(got.pregSummary,"",`${name}: graviditetssummary läcker`);
    assert.equal(got.pregStatus,"",`${name}: graviditetsstatus läcker`);
    assert.equal(got.phaseNote,"",`${name}: graviditetsfas läcker`);
  } else {
    assert.equal(got.pregSummary,pregnancySummary[pump][phase],`${name}: fel graviditetssummary`);
    assert.equal(got.pregStatus,pump==="omnipod"?"· AID off-label vid graviditet":"",`${name}: fel graviditetsstatus`);
    assert.ok(got.pregDetail.length>0,`${name}: graviditetsstrategi saknas`);
  }
  assert.equal(got.metaIconCount,0,`${name}: sökväg innehåller ikon`);
  assert.deepEqual(got.icons,got.actions.map((title,i)=>expectedIcon(title,got.menus[i])),`${name}: fel åtgärdsikoner`);
  behaviorRegression++;
}
assert.equal(behaviorRegression,84);

// Render/smoke matrix and global release invariants.
let matrix=0;
for(const pump of pumps) for(const pattern of patterns) for(const context of ["standard","pregnancy"]) for(const phase of (context==="pregnancy"?["early","late"]:["early"])){
  const got=snapshot({context,pump,phase,pattern}), joined=JSON.stringify(got);
  assert.ok(!joined.includes("undefined"),`${pump}/${context}/${phase}/${pattern}: undefined i render`);
  assert.ok(!joined.includes("NaN"),`${pump}/${context}/${phase}/${pattern}: NaN i render`);
  matrix++;
}
assert.equal(matrix,84);
assert.ok(html.includes("AID-lathund v182"),"v182-version saknas");
assert.ok(html.includes("Källor · verifierade 2026-08-31"),"källverifieringsdatum saknas");
assert.ok(html.includes("EASD/ISPAD position statement om AID vid fysisk aktivitet"),"aktivitetsreferens saknas");
assert.ok(!html.includes("Fantomkolhydrater"),"Föråldrad term Fantomkolhydrater finns kvar");

// v182-specific clinical regression gates.
{
  const earlyHigh=snapshot({context:"pregnancy",pump:"omnipod",phase:"early",pattern:"mealHighPersistent"});
  assert.ok(!renderedText(earlyHigh).includes("Omvänd korrektion"),"OP5 sMVC v0–15: omvänd korrektion får inte visas");
  assert.ok(earlyHigh.actions.includes("Falska KH vb"),"OP5 sMVC v0–15: Falska KH saknas");
  const earlyLow=snapshot({context:"pregnancy",pump:"omnipod",phase:"early",pattern:"mealLow"});
  assert.ok(!renderedText(earlyLow).includes("Omvänd korrektion"),"OP5 sMVC v0–15 låg: omvänd korrektion får inte visas");
  const nightLow=snapshot({context:"pregnancy",pump:"omnipod",phase:"early",pattern:"fastLow"});
  assert.deepEqual(nightLow.actions,["Höj målglukos i relevant segment"],"OP5 sMVC nattlåg: manualbasal får inte sänkas");

  const camLow=snapshot({pump:"camaps",pattern:"mealLow"});
  assert.equal(camLow.actions[1],"Vid sen hypo: höj personligt målglukos i relevant segment","CamAPS sen postprandiell hypo: målglukosråd saknas");
  assert.ok(camLow.notes[1].includes("Konsensus / klinisk titrering"),"CamAPS sen hypo: fel evidensetikett");

  const opReverse=snapshot({pump:"omnipod",pattern:"mealHighPersistent"});
  assert.ok(opReverse.notes[1].includes("Specialiststöd"),"Omvänd korrektion: fel evidensetikett");
  for(const [pump,label] of [["omnipod","Aktivitet"],["tandem","Träning"],["medtronic","Temp mål"],["camaps","Ease-off"]]){
    const got=snapshot({pump,pattern:"exerciseLow"});
    assert.ok(got.actions[0].includes(`\"${label}\"`),`${pump}: fel aktivitetsnamn`);
    assert.ok(got.notes[0].includes("Konsensus / klinisk titrering"),`${pump}: fel aktivitetsevidens`);
  }
}

// Existing safety/disclosure gates.
{
  const dom=makeDom(); selectContext(dom,"standard"); const d=dom.window.document;
  const safety=d.querySelector(".safety-high");
  assert.ok(safety,"Säkerhetsgren saknas"); assert.equal(safety.open,false,"Säkerhetsgren ska vara stängd initialt");
  safety.querySelector("summary").click(); assert.equal(safety.open,true,"Säkerhetsgren kan inte öppnas");
  for(const text of ["Verifiera glukos","kontrollera ketoner + set/pod","korrigera med penna","byt set/pod","följ lokal keton/DKA-rutin"])
    assert.ok(safety.textContent.includes(text),`Säkerhetsgren saknar: ${text}`);
  const evidenceButton=d.querySelector('[data-meta="evidence"]'), evidence=d.querySelector("#metaEvidence");
  assert.ok(evidenceButton&&evidence,"Evidens/scope-kontroll saknas");
  evidenceButton.click(); assert.ok(!evidence.classList.contains("hidden"),"Evidens/scope kan inte visas");
  assert.ok(evidence.textContent.includes("Aktuell IFU, regulatorisk status och lokal rutin har företräde"),"Scope-disclaimer saknas");
}

console.log(`PASS: ${passed} clinical golden cases`);
console.log(`PASS: ${behaviorRegression} exact behavior regression cases`);
console.log(`PASS: ${matrix} smoke matrix cases`);
console.log("PASS: v182-specific evidence/icon/path/source invariants");
console.log("PASS: safety and isolation invariants");
