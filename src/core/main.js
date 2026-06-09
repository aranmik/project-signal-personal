import { gameState } from "./state.js";
import { renderGame } from "../ui/render.js";
import { startRun, goTitle, applyGrowth, toggleSpeed } from "./battle.js";

console.log("Project Signal Personal — init", gameState);

renderGame(gameState);

// 타이틀 → 전투 시작
document.getElementById("title-start").addEventListener("click", startRun);

// 결과 오버레이 → 처음부터 / 다시 시작 (둘 다 새 런)
document.getElementById("result-restart").addEventListener("click", startRun);

// 결과 오버레이 / 상단 → 타이틀로
document.getElementById("result-title-btn").addEventListener("click", goTitle);
document.getElementById("to-title-btn").addEventListener("click", goTitle);

// Battle Speed 01: 상단 HUD 배속 토글 (1x ↔ 2x)
document.getElementById("speed-toggle").addEventListener("click", toggleSpeed);

// 성장 선택
document.getElementById("growth-atk").addEventListener("click", () => {
  applyGrowth("atk");
});

document.getElementById("growth-maxhp").addEventListener("click", () => {
  applyGrowth("maxHp");
});
