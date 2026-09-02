/** AP3 Workbench client segment: initialization. */
export const CLIENT_INITIALIZATION_SCRIPT = `        if (policyLimitViolation) {
          let disclosure = policyLimitViolation.closest("details");
          while (disclosure) {
            disclosure.open = true;
            disclosure = disclosure.parentElement?.closest("details");
          }
          const label = policyLimitViolation.closest("label")?.querySelector("strong")?.textContent?.trim() || L("这项规则");
          errorBox.textContent = minimumViolation
            ? L("{label}不能低于项目共同规则要求的 {value}。", { label, value: minimumViolation.dataset.policyMin })
            : L("{label}不能超过项目共同规则允许的 {value} 秒。", { label, value: maximumViolation.dataset.policyMax });
          errorBox.hidden = false;
          policyLimitViolation.setAttribute("aria-invalid", "true");
          policyLimitViolation.focus();
          return;
        }
        const values = new FormData(policyForm);
        const submitLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = L("正在保存…");
        errorBox.hidden = true;
        const capabilities = String(values.get("required_capabilities") || "")
          .split(/[\\n,，]/)
          .map((item) => item.trim())
          .filter(Boolean);
        try {
          const response = await fetch(route("/api/policy-bindings"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({
              scope: values.get("scope"),
              goal_id: values.get("goal_id") || undefined,
              reason: String(values.get("reason") || "").trim(),
              policy: {
                goal_mode: values.get("goal_mode"),
                self_verification: values.has("self_verification"),
                cross_reviewers: Number(values.get("cross_reviewers")),
                adversarial_reviewers: Number(values.get("adversarial_reviewers")),
                human_approval: values.has("human_approval"),
                required_capabilities: [...new Set(capabilities)],
                max_lease_seconds: Number(values.get("max_lease_seconds")),
              },
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("工作规则保存失败"));
          await refreshBoard(true);
          if (values.get("scope") === "goal") {
            const policy = result?.resolved_policy || {
              goal_mode: values.get("goal_mode"),
              self_verification: values.has("self_verification"),
              human_approval: values.has("human_approval"),
            };
            const modeLabels = { disabled: L("不要求"), preferred: L("建议使用"), required: L("必须使用") };
            showFactorReceipt(
              "rules",
              L("工作规则已保存"),
              L("最终生效：按 Goal 工作“{mode}”，推进者自检“{self}”，用户确认“{human}”。", {
                mode: modeLabels[policy.goal_mode] || String(policy.goal_mode || ""),
                self: policy.self_verification ? L("需要") : L("不需要"),
                human: policy.human_approval ? L("需要") : L("不需要"),
              }),
            );
          } else {
            showToast(L("项目默认工作规则已保存"));
          }
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, L("工作规则保存失败，请检查输入后重试"));
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
        return;
      }

      const reviewForm = submittedForm.closest?.("[data-human-review-form]");
      if (reviewForm) {
        event.preventDefault();
        const submit = reviewForm.querySelector('button[type="submit"]');
        const errorBox = reviewForm.querySelector("[data-review-error]");
        const values = new FormData(reviewForm);
        if (requireDecisionText(reviewForm, errorBox, "verdict", "请先选择结论。")) return;
        if (requireDecisionText(reviewForm, errorBox, "reasoning", "请填写判断理由。说明结果为什么达到或没有达到完成标准。")) return;
        const extraRefs = String(values.get("evidence_refs_extra") || "")
          .split("\\n")
          .map((item) => item.trim())
          .filter(Boolean);
        const evidenceRefs = [...new Set([...values.getAll("evidence_refs").map(String), ...extraRefs])];
        const receiptContext = decisionReceiptContext(reviewForm);
        const submitLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = L("正在保存…");
        errorBox.hidden = true;
        try {
          const response = await fetch(
            route("/api/goals/" + encodeURIComponent(reviewForm.dataset.goalId) +
              "/review-obligations/" + encodeURIComponent(reviewForm.dataset.obligationId) +
              "/review"),
            {
              method: "POST",
              headers: goalboardControlHeaders(),
              body: JSON.stringify({
                verdict: values.get("verdict"),
                evidence_refs: evidenceRefs,
                reasoning: String(values.get("reasoning") || "").trim(),
                attention_token: reviewForm.dataset.attentionToken,
                contract_revision: Number(reviewForm.dataset.contractRevision),
              }),
            },
          );
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "结果确认保存失败");
          const resultMessages = {
            pass: L("结果已确认通过；Goal 是否完成仍由全部完成条件共同决定。"),
            needs_changes: L("结果已退回修改；你的理由和依据已保留。"),
            fail: L("结果已确认未通过；你的理由和依据已保留。"),
            inconclusive: L("结果暂未判断；请补充与完成标准对应的依据。"),
          };
          const nextAction = result?.transition?.projection?.primary_action;
          const receiptMessage = (resultMessages[result?.review?.verdict] || L("结果确认已记录。")) +
            (nextAction ? L(" 下一步：{action}。", { action: result.transition.summary || nextAction.kind }) : "");
          await refreshBoardWithDecisionReceipt(receiptMessage, receiptContext);
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, "结果确认保存失败，请检查输入后重试");
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
      }
    });

    form?.addEventListener("change", updateRelationPreviews);

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      formError.hidden = true;
      const values = new FormData(form);
      const payload = {
        goal_id: String(values.get("goal_id") || "").trim() || undefined,
        title: String(values.get("title") || "").trim(),
        outcome: String(values.get("outcome") || "").trim(),
        why: String(values.get("why") || "").trim(),
        business_logic: String(values.get("business_logic") || "").trim(),
        priority: Number(values.get("priority") || 0),
        parent_goal_id: String(values.get("parent_goal_id") || "").trim() || undefined,
        dependency_goal_ids: values.getAll("dependency_goal_ids").map(String),
        acceptance_criteria: String(values.get("acceptance_criteria") || "").split("\\n").map((line) => line.trim()).filter(Boolean),
      };
      try {
        const response = await fetch(route("/api/goals"), {
          method: "POST",
          headers: goalboardControlHeaders(),
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "创建失败");
        sessionStorage.removeItem(currentGoalUiStorageKey);
        location.assign(globalThis.goalboardNavigationUrl(result.goal_path));
      } catch (error) {
        formError.textContent = error.message || "创建失败，请检查输入后重试";
        formError.hidden = false;
        submit.disabled = false;
      }
    });

    addEventListener("popstate", (event) => {
      const pathname = localPathname();
      const match = pathname.match(
        trashView ? /^\\/trash\\/goals\\/(.+)$/ : archiveView ? /^\\/archive\\/goals\\/(.+)$/ : /^\\/goals\\/(.+)$/,
      );
      const collectionRoot = trashView ? "/trash" : archiveView ? "/archive" : "/";
      const rootGoalId = pathname === collectionRoot
        ? String(event.state?.goalId || state.active_goal_id || visibleGoals()[0]?.goal.goal_id || "")
        : "";
      const goalId = match ? decodeURIComponent(match[1]) : rootGoalId;
      if (goalId) void selectGoal(goalId, false);
    });
    addEventListener("hashchange", () => {
      const targetId = decodeURIComponent(location.hash.slice(1));
      const panel = goalPanelFromHash();
      if (panel) setGoalPanel(panel, true);
      const factor = goalFactorFromHash();
      if (factor) setGoalFactor(factor, true);
      const target = targetId ? document.getElementById(targetId) : null;
      if (target?.matches?.("[data-goal-panel]")) documentPane.scrollTop = 0;
      if (targetId) void revealDeepLinkFromId(targetId);
    });
    addEventListener("pagehide", saveUiState);
    addEventListener("keydown", (event) => {
      const currentWorkTab = event.target?.closest?.("[data-work-tab]");
      if (currentWorkTab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        const tabs = [...currentWorkTab.closest('[role="tablist"]').querySelectorAll("[data-work-tab]")];
        const currentIndex = tabs.indexOf(currentWorkTab);
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        const nextTab = tabs[nextIndex];
        const nextGoalId = nextTab.dataset.workTab;
        void selectGoal(nextGoalId).then(() => focusWorkTab(nextGoalId));
        return;
      }
      const currentTab = event.target?.closest?.("[data-goal-tab]");
      if (currentTab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        const tabs = [...currentTab.closest('[role="tablist"]').querySelectorAll("[data-goal-tab]")];
        const currentIndex = tabs.indexOf(currentTab);
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        const nextTab = tabs[nextIndex];
        setGoalPanel(nextTab.dataset.goalTab, true, true, true);
        nextTab.focus();
        return;
      }
      const currentFocusSection = event.target?.closest?.("[data-focus-section-trigger]:not([data-goal-factor-tab])");
      if (currentFocusSection && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        const triggers = [...currentFocusSection.closest("[data-focus-section-deck]").querySelectorAll("[data-focus-section-card-row] > [data-focus-section-card] > [data-focus-section-trigger]")];
        const currentIndex = triggers.indexOf(currentFocusSection);
        const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? triggers.length - 1
            : (currentIndex + direction + triggers.length) % triggers.length;
        event.preventDefault();
        const nextTrigger = triggers[nextIndex];
        activateFocusSection(nextTrigger);
        nextTrigger.focus();
        return;
      }
      const currentFactorTab = event.target?.closest?.("[data-goal-factor-tab]");
      if (currentFactorTab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        const tabs = [...currentFactorTab.closest('[role="tablist"]').querySelectorAll("[data-goal-factor-tab]")];
        const currentIndex = tabs.indexOf(currentFactorTab);
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        const nextTab = tabs[nextIndex];
        setGoalFactor(nextTab.dataset.goalFactorTab, true, true);
        nextTab.focus();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        globalSearch?.focus();
      }
      if (event.key === "Escape" && !treeFilter?.hidden) {
        event.preventDefault();
        setTreeFilterOpen(false);
        treeFilterTrigger?.focus();
        return;
      }
      if (event.key === "Escape" && !feedFilterPanel?.hidden) {
        event.preventDefault();
        setFeedFilterOpen(false);
        feedFilterTrigger?.focus();
        return;
      }
      const quickDialog = document.querySelector("[data-quick-record-dialog][open]");
      if (event.key === "Escape" && quickDialog) {
        event.preventDefault();
        quickDialog.close();
        resetQuickRecordDialog(quickDialog);
        quickDialog._opener?.focus();
        return;
      }
      if (event.key === "Escape" && dialog.open) {
        dialog.close();
        refreshBoard();
      }
      if (event.key === "Escape" && trashDialog?.open) closeGoalTrashDialog();
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshBoard();
    });
    addEventListener("resize", () => {
      const nextCompanionActive = document.body.dataset.desktopShell === "true" && matchMedia("(max-width: 760px)").matches;
      if (nextCompanionActive && !desktopCompanionActive && selected) setMobileView("document");
      desktopCompanionActive = nextCompanionActive;
      setTreeWidth(treePane.getBoundingClientRect().width, false);
      requestAnimationFrame(() => graphAutoFit ? fitGoalGraph(false) : drawGoalGraph());
    });

    setTreeWidth(treePane.getBoundingClientRect().width, false);
    if (tuiPane) setTuiWidth(tuiPane.getBoundingClientRect().width, false);
    let restoredUi = false;
    try {
      const stored = JSON.parse(
        sessionStorage.getItem(storageKey) ||
        (!decisionView && !collectionView ? sessionStorage.getItem(goalUiStorageKey) : null) ||
        "null",
      );
      if (stored) {
        applyUiState(stored);
        restoredUi = true;
        sessionStorage.setItem(storageKey, JSON.stringify(stored));
      }
    } catch {}
    if (!restoredUi) {
      setWorkspaceMode("focus", false);
      setGoalPanel(goalPanelFromHash() || "overview", false);
      if (feedDirectory) setFeedPreset("inbox_message", false);
      if (desktopDirectoryPanels.length) {
        setDesktopDirectory(decisionView ? "feed" : treePane?.dataset.desktopDirectory || "root", false, false);
      }
      if (desktopWorkSurfaces.length) setDesktopWorkSurface(decisionView ? "feed" : "goal", false, false);
    }
    const directGoalRequested = /^\\/(?:archive\\/|trash\\/)?goals\\/[^\\/]+\\/?$/.test(localPathname());
    if (directGoalRequested && selected) {
      goalWorkspaceMode = "focus";
      setDesktopDirectory("goals", false, false);
      if (desktopWorkSurfaces.length) setDesktopWorkSurface("goal", false, false);
      setWorkspaceMode("focus", false);
      if (matchMedia("(max-width: 760px)").matches) setMobileView("document");
      saveUiState();
    }
    const feedStartRequested = new URLSearchParams(location.search).get("feed-start") === "1";
    const onboardingRuntimeRequested = new URLSearchParams(location.search).get("onboarding-runtime") === "1";
    if (onboardingRuntimeRequested && selected && tuiPane) {
      goalWorkspaceMode = "runtime";
      setDesktopDirectory("goals", false, false);
      if (desktopWorkSurfaces.length) setDesktopWorkSurface("goal", false, false);
      setWorkspaceMode("runtime", false);
      setMobileView("tui");
      saveUiState();
    }
    if (feedStartRequested && selected && tuiPane) {
      goalWorkspaceMode = "runtime";
      setDesktopDirectory("goals", false, false);
      if (desktopWorkSurfaces.length) setDesktopWorkSurface("goal", false, false);
      setWorkspaceMode("runtime", false);
      setMobileView("tui");
      saveUiState();
    }
    const initialHashTargetId = decodeURIComponent(location.hash.slice(1));
    if (!restoredUi && initialHashTargetId) void revealDeepLinkFromId(initialHashTargetId);
    try {
      const goalMoveReceipt = JSON.parse(sessionStorage.getItem(goalMoveReceiptKey) || "null");
      sessionStorage.removeItem(goalMoveReceiptKey);
      if (goalMoveReceipt?.message) showToast(goalMoveReceipt.message);
    } catch {
      sessionStorage.removeItem(goalMoveReceiptKey);
    }
    try {
      const storedDecisionReceipt = JSON.parse(sessionStorage.getItem("goalboard-decision-receipt") || "null");
      sessionStorage.removeItem("goalboard-decision-receipt");
      if (storedDecisionReceipt?.message) {
        showDecisionReceipt(storedDecisionReceipt.message, storedDecisionReceipt.context);
      }
    } catch {
      sessionStorage.removeItem("goalboard-decision-receipt");
    }
    if (selected && tuiPane) {
      tuiPane.setAttribute("data-goal-id", selected);
      const selectedItem = visibleGoals().find((entry) => entry.goal.goal_id === selected);
      document.dispatchEvent(new CustomEvent("goalboard:goal-changed", { detail: {
        goalId: selected,
        goalTitle: selectedItem?.goal.title || selected,
        status: selectedItem?.status || "",
        statusLabel: selectedItem?.status_label || "",
        statusMeaning: selectedItem?.status_meaning || "",
        statusIconMarkup: selectedItem?.status_icon || "",
        parentReadOnly: Boolean(selectedItem?.is_compound_parent),
        children: selectedItem?.children || [],
      } }));
    }
    if (selected) ensureWorkTab(selected);
    else renderWorkTabs();
    updateRelationPreviews();
    updateAllRelationFormPreviews();
    setInterval(refreshBoard, 4000);
  })();
`;

