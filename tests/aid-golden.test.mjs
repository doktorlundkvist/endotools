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
  const pregOpt = d.querySelector("#pregOpt");
  const phaseNote = d.querySelector("#pregPhaseNote");
  return {
    actions: [...d.querySelectorAll("#actions .act")].map(x => x.childNodes[0].textContent.trim()),
    menus: [...d.querySelectorAll("#actions .actmeta")].map(x => x.textContent.trim()),
    pregSummary: d.querySelector("#pregOptSummary")?.textContent.trim() || "",
    pregStatus: d.querySelector("#pregOptStatus")?.textContent.trim() || "",
    pregDetail: d.querySelector("#pregOptText")?.textContent.trim() || "",
    pregVisible: !pregOpt?.classList.contains("hidden"),
    phaseNote: phaseNote?.textContent.trim() || "",
    phaseNoteVisible: !phaseNote?.classList.contains("hidden"),
    behavior: d.querySelector("#behaviorText")?.textContent.trim() || "",
    hypoVisible: !d.querySelector("#hypoTreatment")?.classList.contains("hidden"),
    systemTips: d.querySelector("#interpretTool")?.textContent.trim() || ""
  };
}

function renderedText(got) {
  return [
    ...got.actions,
    ...got.menus,
    got.pregSummary,
    got.pregStatus,
    got.pregDetail,
    got.phaseNote,
    got.behavior,
    got.systemTips
  ].join("\n");
}

function assertCase(g, got) {
  if (g.actions) assert.deepEqual(got.actions, g.actions, `${g.name}: fel åtgärdsordning`);
  if (g.actionIncludes) {
    assert.equal(got.actions.length, g.actionIncludes.length, `${g.name}: fel antal åtgärder`);
    g.actionIncludes.forEach((expected, index) => {
      assert.ok(got.actions[index].includes(expected), `${g.name}: åtgärd ${index + 1} ska innehålla ${expected}`);
    });
  }
  for (const [index, expected] of Object.entries(g.actionEquals || {})) {
    assert.equal(got.actions[Number(index)], expected, `${g.name}: åtgärd ${Number(index) + 1} har fel exakt lydelse`);
  }
  if (g.hypoVisible !== undefined) assert.equal(got.hypoVisible, g.hypoVisible, `${g.name}: fel synlighet för hyporuta`);
  if (g.statusIncludes) assert.ok(got.pregStatus.includes(g.statusIncludes), `${g.name}: saknar status ${g.statusIncludes}`);
  if (g.summaryIncludes) assert.ok(got.pregSummary.includes(g.summaryIncludes), `${g.name}: saknar summary ${g.summaryIncludes}`);
  for (const forbidden of g.mustNotInclude || []) {
    assert.ok(!renderedText(got).includes(forbidden), `${g.name}: får inte innehålla ${forbidden}`);
  }
}

function assertTextSequence(text, fragments, name) {
  let previous = -1;
  for (const fragment of fragments) {
    const index = text.indexOf(fragment, previous + 1);
    assert.ok(index > previous, `${name}: saknar eller har fel ordning för ${fragment}`);
    previous = index;
  }
}

// Clinical golden cases: independently reviewed clinical expectations.
const golden = [
  {name:"OP5 standard fasta hög", in:{pump:"omnipod",pattern:"fastHigh"}, actions:["Sänk målglukos om >6,1 mmol/L"], hypoVisible:false},
  {name:"OP5 standard fasta låg", in:{pump:"omnipod",pattern:"fastLow"}, actions:["Höj målglukos i relevant segment"]},
  {name:"OP5 standard måltid kvarstående", in:{pump:"omnipod",pattern:"mealHighPersistent"}, actionIncludes:["Stärk KH-kvot","Omvänd korrektion AV vid bolusreduktion under mål"], actionEquals:{1:"Omvänd korrektion AV vid bolusreduktion under mål"}, hypoVisible:false},
  {name:"OP5 standard måltid låg", in:{pump:"omnipod",pattern:"mealLow"}, actionIncludes:["Försvaga KH-kvot","Omvänd korrektion PÅ vid måltidsstart under mål"], actionEquals:{1:"Omvänd korrektion PÅ vid måltidsstart under mål"}},
  {name:"OP5 standard aktivitet", in:{pump:"omnipod",pattern:"exerciseLow"}, actions:["Aktivitetsfunktion 1–2 h före aktivitet med hyporisk"]},

  {name:"780G standard fasta hög", in:{pump:"medtronic",pattern:"fastHigh"}, actions:["Sätt SmartGuard-mål 5,5 mmol/L","Sätt AIT 2 h"], hypoVisible:false},
  {name:"780G standard fasta låg", in:{pump:"medtronic",pattern:"fastLow"}, actions:["Höj SmartGuard-målet"]},
  {name:"780G standard måltid kvarstående", in:{pump:"medtronic",pattern:"mealHighPersistent"}, actionIncludes:["Stärk KH-kvot"], hypoVisible:false},
  {name:"780G standard aktivitet", in:{pump:"medtronic",pattern:"exerciseLow"}, actions:["Temp mål 1–2 h före aktivitet med hyporisk"]},

  {name:"Tandem standard fasta hög", in:{pump:"tandem",pattern:"fastHigh"}, actionIncludes:["Öka relevant basal","stärk ISF"], hypoVisible:false},
  {name:"Tandem standard fasta låg", in:{pump:"tandem",pattern:"fastLow"}, actionIncludes:["Minska relevant basal","försvaga ISF"]},
  {name:"Tandem standard sen topp", in:{pump:"tandem",pattern:"lateHigh"}, actionIncludes:["Stärk KH-kvot","Förlängd bolus vb"], actionEquals:{1:"Förlängd bolus vb"}, hypoVisible:false},
  {name:"Tandem standard aktivitet", in:{pump:"tandem",pattern:"exerciseLow"}, actions:["Aktivera Träningsläge 1–2 h före aktivitet med hyporisk"]},

  {name:"CamAPS standard fasta hög", in:{pump:"camaps",pattern:"fastHigh"}, actions:["Sänk personligt målglukos"], hypoVisible:false},
  {name:"CamAPS standard fasta låg", in:{pump:"camaps",pattern:"fastLow"}, actions:["Höj personligt målglukos i aktuellt segment"]},
  {name:"CamAPS standard sen topp", in:{pump:"camaps",pattern:"lateHigh"}, actionIncludes:["Stärk KH-kvot","Långsamt absorberad måltid vb"], actionEquals:{1:"Långsamt absorberad måltid vb"}, hypoVisible:false},
  {name:"CamAPS standard aktivitet", in:{pump:"camaps",pattern:"exerciseLow"}, actions:["Ease-off 1–2 h före aktivitet med hyporisk"]},

  {name:"OP5 sMVC fasta hög", in:{context:"pregnancy",pump:"omnipod",phase:"late",pattern:"fastHigh"}, actions:["Säkerställ målglukos 6,1 mmol/L","Överväg manuellt nattläge med anpassad basal"], hypoVisible:false, statusIncludes:"off-label"},
  {name:"OP5 sMVC måltid kvarstående", in:{context:"pregnancy",pump:"omnipod",phase:"late",pattern:"mealHighPersistent"}, actionIncludes:["Stärk KH-kvot","Omvänd korrektion AV vid bolusreduktion under mål","Fantomkolhydrater vb"], actionEquals:{1:"Omvänd korrektion AV vid bolusreduktion under mål",2:"Fantomkolhydrater vb"}, hypoVisible:false, statusIncludes:"off-label"},
  {name:"OP5 sMVC fasta låg", in:{context:"pregnancy",pump:"omnipod",phase:"early",pattern:"fastLow"}, actions:["Höj målglukos i relevant segment","Minska relevant basal"], statusIncludes:"off-label"},

  {name:"Tandem sMVC fasta hög", in:{context:"pregnancy",pump:"tandem",phase:"late",pattern:"fastHigh"}, actionIncludes:["Öka relevant basal","Stärk ISF"], hypoVisible:false, summaryIncludes:"Sömnläge dygnet runt"},
  {name:"780G sMVC grundinställning", in:{context:"pregnancy",pump:"medtronic",phase:"late",pattern:"mealHighPersistent"}, actionIncludes:["Stärk KH-kvot"], hypoVisible:false, summaryIncludes:"SmartGuard-mål 5,5 mmol/L"},
  {name:"CamAPS sMVC tidigt mål", in:{context:"pregnancy",pump:"camaps",phase:"early",pattern:"mealHighPersistent"}, actionIncludes:["Stärk KH-kvot"], hypoVisible:false, summaryIncludes:"5,5 mmol/L"},
  {name:"CamAPS sMVC senare mål", in:{context:"pregnancy",pump:"camaps",phase:"late",pattern:"mealHighPersistent"}, actionIncludes:["Stärk KH-kvot"], hypoVisible:false, summaryIncludes:"5,0 dag / 4,5 natt"},

  // Promoted clinical golden cases: exact expectations reviewed independently of the behavior matrix.
  {name:"Tandem standard måltid låg", in:{pump:"tandem",pattern:"mealLow"}, actionIncludes:["Försvaga KH-kvot"], hypoVisible:true, mustNotInclude:["Stärk KH-kvot"]},
  {name:"780G standard måltid låg", in:{pump:"medtronic",pattern:"mealLow"}, actionIncludes:["Försvaga KH-kvot"], hypoVisible:true, mustNotInclude:["Stärk KH-kvot"]},
  {name:"CamAPS standard måltid låg", in:{pump:"camaps",pattern:"mealLow"}, actionIncludes:["Försvaga KH-kvot"], hypoVisible:true, mustNotInclude:["Stärk KH-kvot"]},

  {name:"Tandem sMVC tidigt fasta låg", in:{context:"pregnancy",pump:"tandem",phase:"early",pattern:"fastLow"}, actionIncludes:["Minska relevant basal","försvaga ISF"], hypoVisible:true, mustNotInclude:["Öka relevant basal","stärk ISF"]},
  {name:"780G sMVC tidigt fasta låg", in:{context:"pregnancy",pump:"medtronic",phase:"early",pattern:"fastLow"}, actions:["Höj SmartGuard-målet"], hypoVisible:true, mustNotInclude:["Sätt SmartGuard-mål 5,5 mmol/L","Sätt AIT 2 h"]},
  {name:"CamAPS sMVC tidigt fasta låg", in:{context:"pregnancy",pump:"camaps",phase:"early",pattern:"fastLow"}, actions:["Höj personligt målglukos i aktuellt segment"], hypoVisible:true, mustNotInclude:["Sänk personligt målglukos"]},
  {name:"OP5 sMVC tidigt måltid låg", in:{context:"pregnancy",pump:"omnipod",phase:"early",pattern:"mealLow"}, actionIncludes:["Försvaga KH-kvot","Omvänd korrektion PÅ vid måltidsstart under mål"], actionEquals:{1:"Omvänd korrektion PÅ vid måltidsstart under mål"}, hypoVisible:true, statusIncludes:"off-label", mustNotInclude:["Stärk KH-kvot","Omvänd korrektion AV"]},
  {name:"Tandem sMVC tidigt måltid låg", in:{context:"pregnancy",pump:"tandem",phase:"early",pattern:"mealLow"}, actionIncludes:["Försvaga KH-kvot"], hypoVisible:true, mustNotInclude:["Stärk KH-kvot"]},
  {name:"780G sMVC tidigt måltid låg", in:{context:"pregnancy",pump:"medtronic",phase:"early",pattern:"mealLow"}, actionIncludes:["Försvaga KH-kvot"], hypoVisible:true, mustNotInclude:["Stärk KH-kvot"]},
  {name:"CamAPS sMVC tidigt måltid låg", in:{context:"pregnancy",pump:"camaps",phase:"early",pattern:"mealLow"}, actionIncludes:["Försvaga KH-kvot"], hypoVisible:true, mustNotInclude:["Stärk KH-kvot"]},

  {name:"OP5 sMVC senare aktivitet låg", in:{context:"pregnancy",pump:"omnipod",phase:"late",pattern:"exerciseLow"}, actions:["Höj mål vid AID / temp basal i manuellt läge"], hypoVisible:true, statusIncludes:"off-label", mustNotInclude:["Sänk målglukos","Säkerställ målglukos 6,1 mmol/L"]},
  {name:"Tandem sMVC senare aktivitet låg", in:{context:"pregnancy",pump:"tandem",phase:"late",pattern:"exerciseLow"}, actions:["Aktivera Träningsläge 1–2 h före aktivitet med hyporisk"], hypoVisible:true, mustNotInclude:["Öka relevant basal"]},
  {name:"780G sMVC senare aktivitet låg", in:{context:"pregnancy",pump:"medtronic",phase:"late",pattern:"exerciseLow"}, actions:["Temp mål 1–2 h före aktivitet med hyporisk"], hypoVisible:true, mustNotInclude:["Sätt SmartGuard-mål 5,5 mmol/L"]},
  {name:"CamAPS sMVC senare aktivitet låg", in:{context:"pregnancy",pump:"camaps",phase:"late",pattern:"exerciseLow"}, actions:["Ease-off 1–2 h före aktivitet med hyporisk"], hypoVisible:true, mustNotInclude:["Sänk personligt målglukos"]},

  // Clinical promotion batch 2.
  {name:"Tandem standard måltid kvarstående", in:{pump:"tandem",pattern:"mealHighPersistent"}, actionIncludes:["Stärk KH-kvot"], hypoVisible:false, mustNotInclude:["Försvaga KH-kvot"]},
  {name:"CamAPS standard måltid kvarstående", in:{pump:"camaps",pattern:"mealHighPersistent"}, actionIncludes:["Stärk KH-kvot"], hypoVisible:false, mustNotInclude:["Försvaga KH-kvot"]},
  {name:"OP5 standard sen topp", in:{pump:"omnipod",pattern:"lateHigh"}, actionIncludes:["Stärk KH-kvot"], hypoVisible:false, mustNotInclude:["Försvaga KH-kvot"]},
  {name:"780G standard sen topp", in:{pump:"medtronic",pattern:"lateHigh"}, actionIncludes:["Stärk KH-kvot"], hypoVisible:false, mustNotInclude:["Försvaga KH-kvot"]},

  {name:"OP5 sMVC tidigt fasta hög", in:{context:"pregnancy",pump:"omnipod",phase:"early",pattern:"fastHigh"}, actions:["Säkerställ målglukos 6,1 mmol/L","Överväg manuellt nattläge med anpassad basal"], hypoVisible:false, statusIncludes:"off-label", summaryIncludes:"Mål 6,1 mmol/L · AID/manual-läge individualiseras", mustNotInclude:["Höj målglukos","Minska relevant basal"]},
  {name:"Tandem sMVC tidigt fasta hög", in:{context:"pregnancy",pump:"tandem",phase:"early",pattern:"fastHigh"}, actionIncludes:["Öka relevant basal","Stärk ISF"], hypoVisible:false, summaryIncludes:"Sömnläge dygnet runt · CIRCUIT-strategi", mustNotInclude:["Minska relevant basal","försvaga ISF"]},
  {name:"780G sMVC tidigt fasta hög", in:{context:"pregnancy",pump:"medtronic",phase:"early",pattern:"fastHigh"}, actions:[], hypoVisible:false, summaryIncludes:"SmartGuard-mål 5,5 mmol/L · AIT 2 h", mustNotInclude:["Höj SmartGuard-målet"]},
  {name:"CamAPS sMVC tidigt fasta hög", in:{context:"pregnancy",pump:"camaps",phase:"early",pattern:"fastHigh"}, actions:[], hypoVisible:false, summaryIncludes:"Målglukos 5,5 mmol/L", mustNotInclude:["Höj personligt målglukos"]},
  {name:"Tandem sMVC tidigt måltid kvarstående", in:{context:"pregnancy",pump:"tandem",phase:"early",pattern:"mealHighPersistent"}, actionIncludes:["Stärk KH-kvot"], hypoVisible:false, summaryIncludes:"Sömnläge dygnet runt · CIRCUIT-strategi", mustNotInclude:["Försvaga KH-kvot"]},

  {name:"780G sMVC senare fasta hög", in:{context:"pregnancy",pump:"medtronic",phase:"late",pattern:"fastHigh"}, actions:[], hypoVisible:false, summaryIncludes:"SmartGuard-mål 5,5 mmol/L · AIT 2 h", mustNotInclude:["Höj SmartGuard-målet"]},
  {name:"CamAPS sMVC senare fasta hög", in:{context:"pregnancy",pump:"camaps",phase:"late",pattern:"fastHigh"}, actions:[], hypoVisible:false, summaryIncludes:"5,0 dag / 4,5 natt", mustNotInclude:["Höj personligt målglukos"]},
  {name:"Tandem sMVC senare måltid kvarstående", in:{context:"pregnancy",pump:"tandem",phase:"late",pattern:"mealHighPersistent"}, actionIncludes:["Stärk KH-kvot"], hypoVisible:false, summaryIncludes:"Sömnläge dygnet runt · CIRCUIT-strategi", mustNotInclude:["Försvaga KH-kvot"]},

  // An isolated transient early postprandial peak does not itself trigger setting changes.
  {name:"OP5 standard övergående måltidstopp utan inställningsändring", in:{pump:"omnipod",pattern:"mealHighTransient"}, actions:[], hypoVisible:false}
];

let passed = 0;
for (const g of golden) {
  const got = snapshot(g.in);
  assertCase(g, got);
  passed++;
}

const pumps = ["omnipod","tandem","medtronic","camaps"];
const patterns = ["fastLow","fastHigh","mealHighTransient","mealHighPersistent","lateHigh","mealLow","exerciseLow"];
const lowPatterns = new Set(["fastLow","mealLow","exerciseLow"]);

const expectedActions = {
  standard: {
    omnipod: {
      fastLow:["Höj målglukos i relevant segment"],
      fastHigh:["Sänk målglukos om >6,1 mmol/L"],
      mealHighTransient:[],
      mealHighPersistent:["Stärk KH-kvot ≈10–20 %","Omvänd korrektion AV vid bolusreduktion under mål"],
      lateHigh:["Stärk KH-kvot ≈10–20 %"],
      mealLow:["Försvaga KH-kvot ≈10–20 %","Omvänd korrektion PÅ vid måltidsstart under mål"],
      exerciseLow:["Aktivitetsfunktion 1–2 h före aktivitet med hyporisk"]
    },
    tandem: {
      fastLow:["Minska relevant basal ≈10–20 %","Om korrektionsdriven: försvaga ISF ≈10–20 %"],
      fastHigh:["Öka relevant basal ≈10–20 %","Om korrektionsdriven: stärk ISF ≈10–20 %"],
      mealHighTransient:[],
      mealHighPersistent:["Stärk KH-kvot ≈10–20 %"],
      lateHigh:["Stärk KH-kvot ≈10–20 %","Förlängd bolus vb"],
      mealLow:["Försvaga KH-kvot ≈10–20 %"],
      exerciseLow:["Aktivera Träningsläge 1–2 h före aktivitet med hyporisk"]
    },
    medtronic: {
      fastLow:["Höj SmartGuard-målet"],
      fastHigh:["Sätt SmartGuard-mål 5,5 mmol/L","Sätt AIT 2 h"],
      mealHighTransient:[],
      mealHighPersistent:["Stärk KH-kvot ≈10–20 %"],
      lateHigh:["Stärk KH-kvot ≈10–20 %"],
      mealLow:["Försvaga KH-kvot ≈10–20 %"],
      exerciseLow:["Temp mål 1–2 h före aktivitet med hyporisk"]
    },
    camaps: {
      fastLow:["Höj personligt målglukos i aktuellt segment"],
      fastHigh:["Sänk personligt målglukos"],
      mealHighTransient:[],
      mealHighPersistent:["Stärk KH-kvot ≈10–20 %"],
      lateHigh:["Stärk KH-kvot ≈10–20 %","Långsamt absorberad måltid vb"],
      mealLow:["Försvaga KH-kvot ≈10–20 %"],
      exerciseLow:["Ease-off 1–2 h före aktivitet med hyporisk"]
    }
  },
  pregnancy: {
    omnipod: {
      fastLow:["Höj målglukos i relevant segment","Minska relevant basal"],
      fastHigh:["Säkerställ målglukos 6,1 mmol/L","Överväg manuellt nattläge med anpassad basal"],
      mealHighTransient:[],
      mealHighPersistent:["Stärk KH-kvot ≈10–20 %","Omvänd korrektion AV vid bolusreduktion under mål","Fantomkolhydrater vb"],
      lateHigh:["Stärk KH-kvot ≈10–20 %","Fantomkolhydrater vb"],
      mealLow:["Försvaga KH-kvot ≈10–20 %","Omvänd korrektion PÅ vid måltidsstart under mål"],
      exerciseLow:["Höj mål vid AID / temp basal i manuellt läge"]
    },
    tandem: {
      fastLow:["Minska relevant basal ≈10–20 %","Om korrektionsdriven: försvaga ISF ≈10–20 %"],
      fastHigh:["Öka relevant basal ≈10–20 %","Stärk ISF ≈10–20 %"],
      mealHighTransient:[],
      mealHighPersistent:["Stärk KH-kvot ≈10–20 %"],
      lateHigh:["Stärk KH-kvot ≈10–20 %","Förlängd bolus vb"],
      mealLow:["Försvaga KH-kvot ≈10–20 %"],
      exerciseLow:["Aktivera Träningsläge 1–2 h före aktivitet med hyporisk"]
    },
    medtronic: {
      fastLow:["Höj SmartGuard-målet"],
      fastHigh:[],
      mealHighTransient:[],
      mealHighPersistent:["Stärk KH-kvot ≈10–20 %"],
      lateHigh:["Stärk KH-kvot ≈10–20 %"],
      mealLow:["Försvaga KH-kvot ≈10–20 %"],
      exerciseLow:["Temp mål 1–2 h före aktivitet med hyporisk"]
    },
    camaps: {
      fastLow:["Höj personligt målglukos i aktuellt segment"],
      fastHigh:[],
      mealHighTransient:[],
      mealHighPersistent:["Stärk KH-kvot ≈10–20 %"],
      lateHigh:["Stärk KH-kvot ≈10–20 %","Långsamt absorberad måltid vb"],
      mealLow:["Försvaga KH-kvot ≈10–20 %"],
      exerciseLow:["Ease-off 1–2 h före aktivitet med hyporisk"]
    }
  }
};

const pregnancySummary = {
  omnipod: {early:"Mål 6,1 mmol/L · AID/manual-läge individualiseras",late:"Mål 6,1 mmol/L · AID/manual-läge individualiseras"},
  tandem: {early:"Sömnläge dygnet runt · CIRCUIT-strategi",late:"Sömnläge dygnet runt · CIRCUIT-strategi"},
  medtronic: {early:"SmartGuard-mål 5,5 mmol/L · AIT 2 h",late:"SmartGuard-mål 5,5 mmol/L · AIT 2 h"},
  camaps: {early:"Målglukos 5,5 mmol/L",late:"Mål 5,5 mmol/L · överväg 5,0 dag / 4,5 natt"}
};

const forbiddenByPump = {
  omnipod:["SmartGuard","Sömnläge","Träningsläge","Ease-off"],
  tandem:["SmartGuard","Ease-off","Omvänd korrektion","Fantomkolhydrater","Aktivitetsfunktion"],
  medtronic:["Sömnläge","Träningsläge","Ease-off","Omvänd korrektion","Fantomkolhydrater","Aktivitetsfunktion"],
  camaps:["SmartGuard","Sömnläge","Träningsläge","Omvänd korrektion","Fantomkolhydrater","Aktivitetsfunktion"]
};

// Exact behavior regression cases lock current reviewed application behavior against
// unintended change, but are not, by themselves, independent clinical validation.
let behaviorRegression = 0;
for (const pump of pumps) {
  for (const pattern of patterns) {
    for (const context of ["standard","pregnancy"]) {
      for (const phase of (context === "pregnancy" ? ["early","late"] : ["early"])) {
        const name = `${pump}/${context}/${phase}/${pattern}`;
        const got = snapshot({context,pump,phase,pattern});
        assertCase({
          name,
          actions:expectedActions[context][pump][pattern],
          mustNotInclude:forbiddenByPump[pump]
        }, got);
        assert.equal(got.hypoVisible, lowPatterns.has(pattern), `${name}: fel synlighet för hyporuta`);
        assert.equal(got.pregVisible, context === "pregnancy", `${name}: fel synlighet för graviditetsstrategi`);
        assert.equal(got.phaseNoteVisible, context === "pregnancy", `${name}: fel synlighet för graviditetsfas`);
        if (context === "standard") {
          assert.equal(got.pregSummary, "", `${name}: graviditetssammanfattning läcker till standardkontext`);
          assert.equal(got.pregStatus, "", `${name}: graviditetsstatus läcker till standardkontext`);
          assert.equal(got.pregDetail, "", `${name}: graviditetsdetaljer läcker till standardkontext`);
          assert.equal(got.phaseNote, "", `${name}: graviditetsfas läcker till standardkontext`);
        } else {
          assert.equal(got.pregSummary, pregnancySummary[pump][phase], `${name}: fel graviditetssammanfattning`);
          assert.equal(got.pregStatus, pump === "omnipod" ? "· AID off-label vid graviditet" : "", `${name}: fel graviditetsstatus`);
          assert.ok(got.pregDetail.length > 0, `${name}: graviditetsstrategi saknas`);
          assert.ok(got.phaseNote.length > 0, `${name}: graviditetsfastext saknas`);
        }
        behaviorRegression++;
      }
    }
  }
}

// Full 84-case smoke matrix, retained separately from the exact clinical matrix.
let matrix = 0;
for (const pump of pumps) {
  for (const pattern of patterns) {
    for (const context of ["standard","pregnancy"]) {
      for (const phase of (context === "pregnancy" ? ["early","late"] : ["early"])) {
        const got = snapshot({context,pump,phase,pattern});
        const joined = JSON.stringify(got);
        assert.ok(!joined.includes("undefined"), `${pump}/${context}/${phase}/${pattern}: undefined i render`);
        assert.ok(!joined.includes("NaN"), `${pump}/${context}/${phase}/${pattern}: NaN i render`);
        assert.equal(got.hypoVisible, lowPatterns.has(pattern), `${pump}/${context}/${phase}/${pattern}: fel hyporuta`);
        assert.equal(got.actions.length, expectedActions[context][pump][pattern].length, `${pump}/${context}/${phase}/${pattern}: oväntat antal åtgärder`);
        assert.equal(got.pregVisible, context === "pregnancy", `${pump}/${context}/${phase}/${pattern}: kontextisolering bruten`);
        matrix++;
      }
    }
  }
}

// Safety and disclosure behavior must work in the rendered DOM.
{
  const dom = makeDom();
  selectContext(dom, "standard");
  const d = dom.window.document;
  const safety = d.querySelector(".safety-high");
  assert.equal(safety.open, false, "Säkerhetsgren för oväntat högt ska vara stängd initialt");
  safety.querySelector("summary").click();
  assert.equal(safety.open, true, "Säkerhetsgren för oväntat högt ska kunna öppnas");
  assertTextSequence(safety.textContent, [
    "Verifiera glukos",
    "kontrollera ketoner + set/pod",
    "Vid tillförselavbrott",
    "korrigera med penna",
    "byt set/pod",
    "injicerat insulin ingår inte i pumpens IOB",
    "följ lokal keton/DKA-rutin"
  ], "Oväntat högt clinical golden");
  passed++;

  const evidenceButton = d.querySelector('[data-meta="evidence"]');
  const evidence = d.querySelector("#metaEvidence");
  assert.ok(evidence.classList.contains("hidden"), "Evidens/scope ska vara dold initialt");
  evidenceButton.click();
  assert.ok(!evidence.classList.contains("hidden"), "Evidens/scope ska kunna visas");
  assert.ok(evidence.textContent.includes("Aktuell IFU, regulatorisk status och lokal rutin har företräde"), "Scope/säkerhetsdisclaimer saknas i DOM");
}

console.log(`PASS: ${passed} clinical golden cases`);
console.log(`PASS: ${behaviorRegression} exact behavior regression cases`);
console.log(`PASS: ${matrix} smoke matrix cases`);
console.log("PASS: safety and isolation invariants");
