import { gameState } from "./state.js";
import { renderGame } from "../ui/render.js";
import { startBattle, resetBattle } from "./battle.js";

console.log("Project Signal Personal — init", gameState);

renderGame(gameState);

document.getElementById("start-button").addEventListener("click", () => {
  if (gameState.battle.status === "ended") {
    resetBattle();
    startBattle();
  } else {
    startBattle();
  }
});
