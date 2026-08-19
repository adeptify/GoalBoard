export function desktopAdvancePrompt(input: { goal_id: string; title: string }): string {
  const title = input.title.trim() || input.goal_id;
  return `请用 GoalBoard 推进 Goal「${title}」（id: ${input.goal_id}）。先读取它的合同，再按当前工作状态澄清或执行。不要改别的 Goal。`;
}
