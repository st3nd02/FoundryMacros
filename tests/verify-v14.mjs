import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relativePath => readFile(path.join(root, relativePath), "utf8");

async function collectJavaScript(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectJavaScript(entryPath));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(entryPath);
  }
  return files;
}

const moduleManifest = JSON.parse(await read("module.json"));
const forgeManifest = JSON.parse(await read("forge-manifest.template.json"));
for (const manifest of [moduleManifest, forgeManifest]) {
  assert.equal(manifest.id, "warhammer-40k-cogitator");
  assert.equal(manifest.version, "3.1.3");
  assert.deepEqual(manifest.compatibility, { minimum: "13", verified: "14", maximum: "14" });
  assert.deepEqual(manifest.styles, ["warhammer-40k-cogitator/styles/cogitator-dialogs.css"]);
}
assert.deepEqual(
  moduleManifest.relationships.requires.map(relationship => relationship.id),
  ["dfreds-convenient-effects", "statuscounter", "socketlib"]
);

const scriptRoot = path.join(root, "warhammer-40k-cogitator", "scripts");
const scriptFiles = await collectJavaScript(scriptRoot);
const sources = await Promise.all(scriptFiles.map(async file => [file, await readFile(file, "utf8")]));
const allSource = sources.map(([, source]) => source).join("\n");

assert.match(allSource, /const COGITATOR_VERSION = "3\.1\.3";/);
assert.equal((allSource.match(/new CogitatorDialogV2\s*\(/g) ?? []).length, 23);
assert.doesNotMatch(allSource, /new Dialog\s*\(/);
assert.doesNotMatch(allSource, /extends FormApplication/);
assert.doesNotMatch(allSource, /\.evaluate\(\{\s*async:\s*true\s*\}\)/);
assert.doesNotMatch(allSource, /canvas\.grid\??\.measureDistance/);
assert.doesNotMatch(allSource, /measurePath\([^\n]+gridSpaces/);

for (const [file, source] of sources) {
  if (source.includes("new CogitatorDialogV2(")) {
    assert.match(source, /import \{ CogitatorDialogV2 \} from /, `${file} must import CogitatorDialogV2`);
  }
}

const main = await read("warhammer-40k-cogitator/scripts/main.js");
const dialogStyles = await read("warhammer-40k-cogitator/styles/cogitator-dialogs.css");
const damageWorkflow = await read("warhammer-40k-cogitator/scripts/workflows/dh2e_external_damage_workflow.js");
const psychicWorkflow = await read("warhammer-40k-cogitator/scripts/workflows/dh2e_external_psychic_workflow.js");
assert.match(dialogStyles, /\.dialog-content > br\s*\{\s*display: none;/);
assert.match(dialogStyles, /select option,[\s\S]*?background-color: var\(--cogitator-parchment\);/);
assert.match(damageWorkflow, /class="cogitator-damage-formula"/);
assert.match(psychicWorkflow, /\{ width: 900 \}\)\.render\(true\);/);
for (const persistedIdentifier of [
  'const COGITATOR_ID = "warhammer-40k-cogitator"',
  'workflowHudEnabled: "workflowHudEnabled"',
  'workflowHudLocked: "workflowHudLocked"',
  'workflowHudPosX: "workflowHudPosX"',
  'workflowHudPosY: "workflowHudPosY"',
  'workflowHudLayout: "workflowHudLayout"',
  'forceFieldFatePolicy: "forceFieldFatePolicy"',
  'const WORKFLOW_NS = "warhammer-40k-cogitator"',
  'const WORKFLOW_KEY = "dh2eExternalWorkflow"',
  'const REACTION_FLAG = "reactionUsedForDefense"',
  'const REACTION_COUNT_FLAG = "reactionUsedForDefenseCount"',
  'requestDefense: "requestDefense"',
  'defenseResolved: "defenseResolved"',
  'damageReady: "damageReady"',
  'damageResolved: "damageResolved"'
]) {
  assert.ok(main.includes(persistedIdentifier), `missing persisted identifier: ${persistedIdentifier}`);
}

const publicApiBlock = main.match(/game\.warhammer40kCogitator\s*=\s*\{([\s\S]*?)\n\s*\};/)?.[1] ?? "";
const publicApi = [...publicApiBlock.matchAll(/^\s{4}([A-Za-z][A-Za-z0-9_]*),?$/gm)].map(match => match[1]);
assert.deepEqual(publicApi, [
  "openLauncher",
  "openCharacteristicTest",
  "openFearTest",
  "openSkillTest",
  "openMedicalTest",
  "openHealingFlow",
  "openFateRestore",
  "openFatigueManager",
  "openAmmoReload",
  "runPsychicPowerWorkflow",
  "openForceFieldCheck",
  "resolveForceFieldIntercept",
  "runStep",
  "emitSocket",
  "submitDefenseResult",
  "getDefenseRecipients",
  "hasDefenseReaction",
  "consumeDefenseReaction",
  "clearDefenseReaction",
  "setPendingDefenseContext",
  "consumePendingDefenseContext",
  "promptDefenseRequest",
  "setPendingDamageContext",
  "consumePendingDamageContext",
  "submitDamageResult",
  "setPendingAttackContext",
  "consumePendingAttackContext",
  "applyBlademasterUsedEffect",
  "applyDevastatingAssaultEffect",
  "applyDoubleTapEffect",
  "clearDoubleTapEffect",
  "applyWeaponRechargingEffect",
  "addConvenientEffectToActor",
  "requestFateRerollDecision",
  "refreshWorkflowHud"
]);

await read("warhammer-40k-cogitator/templates/workflow-hud-reset.hbs");
console.log(`Verified ${scriptFiles.length} JavaScript files for the Foundry v14 migration contract.`);
