import { gameState } from "./state.js";
import { renderGame } from "../ui/render.js";
import { startBattle, resetBattle, advanceStage, applyGrowth } from "./battle.js";

console.log("Project Signal Personal — init", gameState);

renderGame(gameState);

document.getElementById("start-button").addEventListener("click", () => {
  if (gameState.battle.status === "ended") {
    if (gameState.run.result === "clear") {
      resetBattle();
      startBattle();
    } else {
      resetBattle();
      startBattle();
    }
  } else {
    startBattle();
  }
});

document.getElementById("growth-atk").addEventListener("click", () => {
  applyGrowth("atk");
});

document.getElementById("growth-maxhp").addEventListener("click", () => {
  applyGrowth("maxHp");
});
