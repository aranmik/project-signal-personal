import { gameState } from "./state.js";
import { renderGame } from "../ui/render.js";
import { startBattle, resetBattle, advanceStage } from "./battle.js";

console.log("Project Signal Personal — init", gameState);

renderGame(gameState);

document.getElementById("start-button").addEventListener("click", () => {
  if (gameState.battle.status === "ended") {
    if (gameState.run.result === "victory") {
      advanceStage();
    } else {
      resetBattle();
      startBattle();
    }
  } else {
    startBattle();
  }
});
