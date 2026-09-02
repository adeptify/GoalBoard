export const WORK_TAB_VISIBILITY_CLIENT_SCRIPT = String.raw`
    let workTabsVisibilityFrame = 0;
    const ensureActiveWorkTabVisible = () => {
      if (!workTabs) return;
      if (workTabsVisibilityFrame) cancelAnimationFrame(workTabsVisibilityFrame);
      workTabsVisibilityFrame = requestAnimationFrame(() => {
        workTabsVisibilityFrame = 0;
        const activeTabShell = workTabs.querySelector(".desktop-work-tab.is-selected");
        if (!activeTabShell) return;
        const railRect = workTabs.getBoundingClientRect();
        const tabRect = activeTabShell.getBoundingClientRect();
        if (tabRect.left < railRect.left) {
          workTabs.scrollLeft -= railRect.left - tabRect.left;
        } else if (tabRect.right > railRect.right) {
          workTabs.scrollLeft += tabRect.right - railRect.right;
        }
      });
    };
    const workTabsResizeObserver = workTabs && typeof ResizeObserver === "function"
      ? new ResizeObserver(ensureActiveWorkTabVisible)
      : null;
    workTabsResizeObserver?.observe(workTabs);
`;


