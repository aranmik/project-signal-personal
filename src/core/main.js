import { gameState } from "./state.js";
import { renderGame } from "../ui/render.js";
import { startRun, goTitle, applyGrowth, cycleSpeed, startPreview } from "./battle.js";

console.log("Project Signal Personal — init", gameState);

renderGame(gameState);

// 타이틀 → 전투 시작
document.getElementById("title-start").addEventListener("click", startRun);

// 결과 오버레이 → 처음부터 / 다시 시작 (둘 다 새 런)
document.getElementById("result-restart").addEventListener("click", startRun);

// 결과 오버레이 / 상단 → 타이틀로
document.getElementById("result-title-btn").addEventListener("click", goTitle);
document.getElementById("to-title-btn").addEventListener("click", goTitle);

// Combat Breath Preview 01: 상단 HUD 배속 순환 (1x→2x→3x→4x→MAX)
document.getElementById("speed-toggle").addEventListener("click", cycleSpeed);

// Combat Breath Preview 01: 개발/프리뷰용 전투 장면 버튼
document.querySelectorAll("#preview-bar [data-preview]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const kind = btn.dataset.preview;
    if (kind === "default") startRun();
    else startPreview(kind);
  });
});

// 성장 선택
document.getElementById("growth-atk").addEventListener("click", () => {
  applyGrowth("atk");
});

document.getElementById("growth-maxhp").addEventListener("click", () => {
  applyGrowth("maxHp");
});
