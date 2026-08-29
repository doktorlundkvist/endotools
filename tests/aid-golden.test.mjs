import fs from "node:fs";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const html = fs.readFileSync("index.html", "utf8");

function makeDom() {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "https://example.test/"
  });
  return dom;
}

function clickByText(nodes, text) {
  const el = [...nodes].find(x => x.textContent.trim() === text);
  assert.ok(el, `Hittade inte UI-val: ${text}`);
  el.click();
}

function selectContext(dom, context) {
  const d = dom.window.document;
  (context === "pregnancy" ? d.querySelector("#choosePregnancy") : d.querySelector("#chooseStandard")).click();
}

function selectPump(dom, pump) {
  const d = dom.window.document;
  const s = d.querySelector("#pump");
  s.value = pump;
  s.dispatchEvent(new dom.window.Event("change", {bubbles:true}));
}

function selectPhase(dom, phase) {
  const d = dom.window.document;
  const s = d.querySelector("#phase");
  s.value = phase;
  s.dispatchEvent(new dom.window.Event("change", {bubbles:true}));
}

function selectPattern(dom, pattern) {
  const d = dom.window.document;
  const map = {
    fastLow: ["Fasta", "Lågt"],
    fastHigh: ["Fasta", "Högt"],
    mealHighTransient: ["Måltid", "Övergående topp"],
    mealHighPersistent: ["Måltid", "Kvarstående topp"],
    lateHigh: ["Måltid", "Sen topp"],
    mealLow: ["Måltid", "Lågt efter mat"],
    exerciseLow: ["Aktivitet", "Lågt vid/efter aktivitet"]
  };
  const [cat, item] = map[pattern];
  clickByText(d.querySelectorAll(".catbtn"), cat);
  if (cat === "Måltid") {
    const card = [...d.querySelectorAll(".curve-card")].find(x => x.getAttribute("aria-label") === item);
    assert.ok(card, `Hittade inte måltidsmönster: ${item}`);
    card.click();
  } else {
    clickByText(d.querySelectorAll(".patbtn"), item);
  }
}

function snapshot({context="standard", pump, phase="early", pattern}) {
  const dom = makeDom();
  selectContext(dom, context);
  selectPump(dom, pump);
  if (context === "pregnancy") selectPhase(dom, phase);
  selectPattern(dom, pattern);
  const d = dom.window.document;
  return {
    actions: [...d.querySelectorAll("#actions .act")].map(x => x.childNodes[0].textContent.trim()),
    menus: [...d.querySelectorAll("#actions .actmeta")].map(x => x.textContent.trim()),
    pregSummary: d.querySelector("#pregOptSummary")?.textContent.trim() || "",
    pregStatus: d.querySelector("#pregOptStatus")?.textContent.trim() || "",
    pregDetail: d.querySelector("#pregOptText")?.textContent.trim() || "",
    behavior: d.querySelector("#behaviorText")?.textContent.trim() || "",
    hypoVisible: !d.querySelector("#hypoTreatment")?.classList.contains("hidden")
  };
}

const golden = [
  {name:"OP5 standard fasta hög", in:{pump:"omnipod",pattern:"fastHigh"}, actions:["Sänk målglukos om >6,1 mmol/L"]},
  {name:"OP5 standard fasta låg", in:{pump:"omnipod",pattern:"fastLow"}, actions:["Höj målglukos i relevant segment"]},
  {name:"OP5 standard måltid kvarstående", in:{pump:"omnipod",pattern:"mealHighPersistent"}, actions:["Stärk KH-kvot ≈10–20 %","Omvänd korrektion AV vid bolusreduktion under mål"]},
  {name:"OP5 standard måltid låg", in:{pump:"omnipod",pattern:"mealLow"}, actions:["Försvaga KH-kvot ≈10–20 %","Omvänd korrektion PÅ vid måltidsstart under mål"]},
  {name:"OP5 standard aktivitet", in:{pump:"omnipod",pattern:"exerciseLow"}, actions:["Aktivitetsfunktion 1–2 h före aktivitet med hyporisk"]},

  {name:"780G standard fasta hög", in:{pump:"medtronic",pattern:"fastHigh"}, actions:["Sätt SmartGuard-mål 5,5 mmol/L","Sätt AIT 2 h"]},
  {name:"780G standard fasta låg", in:{pump:"medtronic",pattern:"fastLow"}, actions:["Höj SmartGuard-målet"]},
  {name:"780G standard måltid kvarstående", in:{pump:"medtronic",pattern:"mealHighPersistent"}, actions:["Stärk KH-kvot ≈10–20 %"]},
  {name:"780G standard aktivitet", in:{pump:"medtronic",pattern:"exerciseLow"}, actions:["Temp mål 1–2 h före aktivitet med hyporisk"]},

  {name:"Tandem standard fasta hög", in:{pump:"tandem",pattern:"fastHigh"}, actions:["Öka relevant basal ≈10–20 %","Om korrektionsdriven: stärk ISF ≈10–20 %"]},
  {name:"Tandem standard fasta låg", in:{pump:"tandem",pattern:"fastLow"}, actions:["Minska relevant basal ≈10–20 %","Om korrektionsdriven: försvaga ISF ≈10–20 %"]},
  {name:"Tandem standard sen topp", in:{pump:"tandem",pattern:"lateHigh"}, actions:["Stärk KH-kvot ≈10–20 %","Förlängd bolus vb"]},
  {name:"Tandem standard aktivitet", in:{pump:"tandem",pattern:"exerciseLow"}, actions:["Aktivera Träningsläge 1–2 h före aktivitet med hyporisk"]},

  {name:"CamAPS standard fasta hög", in:{pump:"camaps",pattern:"fastHigh"}, actions:["Sänk personligt målglukos"]},
  {name:"CamAPS standard fasta låg", in:{pump:"camaps",pattern:"fastLow"}, actions:["Höj personligt målglukos i aktuellt segment"]},
  {name:"CamAPS standard sen topp", in:{pump:"camaps",pattern:"lateHigh"}, actions:["Stärk KH-kvot ≈10–20 %","Långsamt absorberad måltid vb"]},
  {name:"CamAPS standard aktivitet", in:{pump:"camaps",pattern:"exerciseLow"}, actions:["Ease-off 1–2 h före aktivitet med hyporisk"]},

  {name:"OP5 sMVC fasta hög", in:{context:"pregnancy",pump:"omnipod",phase:"late",pattern:"fastHigh"}, actions:["Säkerställ målglukos 6,1 mmol/L","Överväg manuellt nattläge med anpassad basal"], statusIncludes:"off-label"},
  {name:"OP5 sMVC måltid kvarstående", in:{context:"pregnancy",pump:"omnipod",phase:"late",pattern:"mealHighPersistent"}, actions:["Stärk KH-kvot ≈10–20 %","Omvänd korrektion AV vid bolusreduktion under mål","Fantomkolhydrater vb"], statusIncludes:"off-label"},
  {name:"OP5 sMVC fasta låg", in:{context:"pregnancy",pump:"omnipod",phase:"early",pattern:"fastLow"}, actions:["Höj målglukos i relevant segment","Minska relevant basal"], statusIncludes:"off-label"},

  {name:"Tandem sMVC fasta hög", in:{context:"pregnancy",pump:"tandem",phase:"late",pattern:"fastHigh"}, actions:["Öka relevant basal ≈10–20 %","Stärk ISF ≈10–20 %"], summaryIncludes:"Sömnläge dygnet runt"},
  {name:"780G sMVC grundinställning", in:{context:"pregnancy",pump:"medtronic",phase:"late",pattern:"mealHighPersistent"}, actions:["Stärk KH-kvot ≈10–20 %"], summaryIncludes:"SmartGuard-mål 5,5 mmol/L"},
  {name:"CamAPS sMVC tidigt mål", in:{context:"pregnancy",pump:"camaps",phase:"early",pattern:"mealHighPersistent"}, actions:["Stärk KH-kvot ≈10–20 %"], summaryIncludes:"5,5 mmol/L"},
  {name:"CamAPS sMVC senare mål", in:{context:"pregnancy",pump:"camaps",phase:"late",pattern:"mealHighPersistent"}, actions:["Stärk KH-kvot ≈10–20 %"], summaryIncludes:"5,0 dag / 4,5 natt"}
];

let passed = 0;
for (const g of golden) {
  const got = snapshot(g.in);
  assert.deepEqual(got.actions, g.actions, `${g.name}: fel åtgärdsordning`);
  if (g.statusIncludes) assert.ok(got.pregStatus.includes(g.statusIncludes), `${g.name}: saknar status ${g.statusIncludes}`);
  if (g.summaryIncludes) assert.ok(got.pregSummary.includes(g.summaryIncludes), `${g.name}: saknar summary ${g.summaryIncludes}`);
  passed++;
}

// Full regression matrix: every current pump × context × phase × pattern must render without undefined/NaN.
const pumps = ["omnipod","tandem","medtronic","camaps"];
const patterns = ["fastLow","fastHigh","mealHighTransient","mealHighPersistent","lateHigh","mealLow","exerciseLow"];
let matrix = 0;
for (const pump of pumps) {
  for (const pattern of patterns) {
    for (const context of ["standard","pregnancy"]) {
      for (const phase of (context === "pregnancy" ? ["early","late"] : ["early"])) {
        const got = snapshot({context,pump,phase,pattern});
        const joined = JSON.stringify(got);
        assert.ok(!joined.includes("undefined"), `${pump}/${context}/${phase}/${pattern}: undefined i render`);
        assert.ok(!joined.includes("NaN"), `${pump}/${context}/${phase}/${pattern}: NaN i render`);
        if (["fastLow","mealLow","exerciseLow"].includes(pattern)) {
          assert.equal(got.hypoVisible, true, `${pump}/${context}/${phase}/${pattern}: hyporuta ska visas`);
        }
        matrix++;
      }
    }
  }
}

// Global safety invariants.
assert.ok(html.includes("Verifiera glukos, kontrollera ketoner + set/pod"), "Säkerhetsgren för oväntat högt saknas");
assert.ok(html.includes("AID off-label vid graviditet"), "Omnipod graviditet saknar off-label-markering");
assert.ok(html.includes("Aktuell IFU, regulatorisk status och lokal rutin har företräde"), "Scope/säkerhetsdisclaimer saknas");

console.log(`PASS: ${passed} golden cases`);
console.log(`PASS: ${matrix} matrix cases`);
console.log("PASS: safety invariants");
