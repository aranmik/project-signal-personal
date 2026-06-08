import { gameState } from "./state.js";

console.log("Project Signal Personal — init", gameState);

document.getElementById("stage-label").textContent = `Stage ${gameState.run.stage}`;
document.getElementById("status-label").textContent = gameState.battle.status;
