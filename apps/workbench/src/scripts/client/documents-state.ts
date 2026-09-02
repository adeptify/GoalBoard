/** AP3 Workbench client segment: documents-state. */
export const CLIENT_DOCUMENTS_STATE_SCRIPT = `      const renderedPanel = target?.closest?.("[data-goal-panel]")?.dataset.goalPanel;
      if (renderedPanel) return renderedPanel;
      const panelTarget = targetId.match(/^goal-panel-(overview|completion|progress|factors|records)-/);
      if (panelTarget) return panelTarget[1];
      if (targetId.startsWith("completion-") || targetId.startsWith("acceptance-")) return "completion";
      if (targetId.startsWith("progress-")) return "progress";
      if (/^(?:goal-factor-panel|relation|risk|impact)-/.test(targetId)) return "factors";
      return "";
    };

    const goalPanelFromHash = () => {
      const targetId = decodeURIComponent(location.hash.slice(1));
      return goalPanelFromTargetId(targetId);
    };

    const goalFactorFromTargetId = (targetId) => {
      if (!targetId) return "";
      const target = document.getElementById(targetId);
      const renderedFactor = target?.closest?.("[data-goal-factor-panel]")?.dataset.goalFactorPanel;
      if (renderedFactor) return renderedFactor;
      const factorTarget = targetId.match(/^goal-factor-panel-(relations|risks|impacts|rules)-/);
      if (factorTarget) return factorTarget[1];
      if (targetId.startsWith("relation-")) return "relations";
      if (targetId.startsWith("risk-")) return "risks";
      if (targetId.startsWith("impact-")) return "impacts";
      return "";
    };

    const goalFactorFromHash = () => {
      const targetId = decodeURIComponent(location.hash.slice(1));
      return goalFactorFromTargetId(targetId);
    };

    const isAbortError = (error) => error instanceof DOMException && error.name === "AbortError";

    const abortGoalRecordsRequest = () => {
      goalRecordsRequest?.abort();
    };

    const loadGoalRecords = async (article) => {
      const container = article?.querySelector("[data-goal-records-content]");
      if (!container || container.dataset.loaded === "true" || container.dataset.loading === "true") return;
      const goalId = article.dataset.goalView;
      if (!goalId) return;
      abortGoalRecordsRequest();
      const controller = new AbortController();
      goalRecordsRequest = controller;
      container.dataset.loading = "true";
      container.setAttribute("aria-busy", "true");
      try {
        const response = await fetch(
          route("/api/goals/" + encodeURIComponent(goalId) + "/records?view=" + documentCollection),
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error(L("无法读取这条 Goal 的完整记录"));
        const template = document.createElement("template");
        template.innerHTML = (await response.text()).trim();
        const records = template.content.querySelector('[data-goal-section="technical"]');
        if (!records) throw new Error(L("Goal 记录响应不完整"));
        if (!article.isConnected || article.dataset.goalView !== goalId) return;
        container.replaceChildren(records);
        container.dataset.loaded = "true";
        const hashTargetId = decodeURIComponent(location.hash.slice(1));
        if (hashTargetId) void revealDeepLinkFromId(hashTargetId);
      } catch (error) {
        if (isAbortError(error)) return;
        if (!article.isConnected || article.dataset.goalView !== goalId) return;
        const message = error instanceof Error ? error.message : L("无法载入完整记录");
        const errorRow = document.createElement("p");
        errorRow.className = "empty-row";
        errorRow.setAttribute("role", "alert");
        errorRow.textContent = message;
        container.replaceChildren(errorRow);
        showToast(message, true);
      } finally {
        if (goalRecordsRequest === controller) {
          goalRecordsRequest = null;
          container.dataset.loading = "false";
          container.removeAttribute("aria-busy");
        }
      }
    };

    const abortGoalPanelRequest = () => {
      goalPanelRequest?.abort();
    };

    const loadGoalPanel = async (article, panelName) => {
      const panel = article?.querySelector('[data-goal-panel="' + panelName + '"]');
      if (!panel || panel.dataset.loaded === "true" || panel.dataset.loading === "true") return;
      const goalId = article.dataset.goalView;
      if (!goalId || !["completion", "progress", "factors"].includes(panelName)) return;
      abortGoalPanelRequest();
      const controller = new AbortController();
      goalPanelRequest = controller;
      panel.dataset.loading = "true";
      panel.setAttribute("aria-busy", "true");
      const status = panel.querySelector("[data-goal-panel-status]");
      if (status) status.textContent = L("正在载入…");
      try {
        const response = await fetch(
          route("/api/goals/" + encodeURIComponent(goalId) + "/panels/" + panelName + "?view=" + documentCollection),
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error(L("无法读取这个 Goal 区域"));
        const template = document.createElement("template");
        template.innerHTML = (await response.text()).trim();
        if (!template.content.childNodes.length) throw new Error(L("Goal 区域响应不完整"));
        if (!article.isConnected || article.dataset.goalView !== goalId || goalPanelRequest !== controller) return;
        panel.replaceChildren(...template.content.childNodes);
        panel.dataset.loaded = "true";
        updateAllRelationFormPreviews();
        document.querySelectorAll("[data-risk-state-form]").forEach(updateRiskStatePreview);
        document.querySelectorAll(".risk-goal-picker").forEach(updateRiskGoalCount);
        if (panelName === "factors") {
          setGoalFactor(goalFactorFromHash() || article.dataset.activeFactor || "relations", false);
        }
        const hashTarget = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        if (hashTarget) revealFocusTarget(hashTarget);
      } catch (error) {
        if (isAbortError(error) || goalPanelRequest !== controller) return;
        if (!article.isConnected || article.dataset.goalView !== goalId) return;
        const message = error instanceof Error ? error.message : L("无法载入这个 Goal 区域");
        const errorRow = document.createElement("button");
        errorRow.type = "button";
        errorRow.className = "empty-row goal-panel-lazy-retry";
        errorRow.dataset.retryGoalPanel = panelName;
        errorRow.textContent = L("{message}，点击重试", { message });
        panel.replaceChildren(errorRow);
        showToast(message, true);
      } finally {
        if (goalPanelRequest === controller) {
          goalPanelRequest = null;
          panel.dataset.loading = "false";
          panel.removeAttribute("aria-busy");
        }
      }
    };

    const loadMoreGoalEvents = async (button) => {
      const pagination = button.closest("[data-goal-event-pagination]");
      const article = button.closest("[data-goal-view]");
      const eventList = article?.querySelector("[data-goal-event-list]");
      const goalId = article?.dataset.goalView;
      const offset = Number.parseInt(pagination?.dataset.nextOffset || "", 10);
      if (!pagination || !eventList || !goalId || !Number.isSafeInteger(offset) || offset < 0) return;
      abortGoalRecordsRequest();
      const controller = new AbortController();
      goalRecordsRequest = controller;
      const defaultLabel = button.textContent;
      const errorBox = pagination.querySelector("[data-goal-event-error]");
      button.disabled = true;
      button.textContent = L("正在载入…");
      if (errorBox) errorBox.hidden = true;
      try {
        const response = await fetch(
          route("/api/goals/" + encodeURIComponent(goalId) + "/record-events?view=" + documentCollection + "&offset=" + offset),
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error(L("无法读取更早的 Goal 记录"));
        const template = document.createElement("template");
        template.innerHTML = (await response.text()).trim();
        const page = template.content.querySelector("[data-goal-event-page]");
        const pageList = page?.querySelector("ol");
        if (!page || !pageList) throw new Error(L("Goal 事件响应不完整"));
        if (!article.isConnected || article.dataset.goalView !== goalId) return;
        eventList.append(...Array.from(pageList.children));
        const nextOffset = Number.parseInt(page.dataset.nextOffset || "", 10);
        const total = Number.parseInt(page.dataset.total || "", 10);
        if (!Number.isSafeInteger(nextOffset) || !Number.isSafeInteger(total)) throw new Error(L("Goal 事件响应不完整"));
        pagination.dataset.nextOffset = String(nextOffset);
        pagination.dataset.total = String(total);
        const progress = pagination.querySelector("[data-goal-event-progress]");
        if (progress) progress.textContent = L("已显示 {shown}/{total} 条事件", { shown: nextOffset, total });
        if (page.dataset.hasMore !== "true") button.remove();
      } catch (error) {
        if (isAbortError(error)) return;
        if (!article.isConnected || article.dataset.goalView !== goalId) return;
        const message = error instanceof Error ? error.message : L("无法载入更早记录");
        if (errorBox) {
          errorBox.textContent = message;
          errorBox.hidden = false;
        }
      } finally {
        if (goalRecordsRequest === controller) {
          goalRecordsRequest = null;
          if (button.isConnected) {
            button.disabled = false;
            button.textContent = defaultLabel;
          }
        }
      }
    };

    const activateFocusSection = (trigger) => {
      const card = trigger?.closest?.("[data-focus-section-card]");
      const deck = card?.closest?.("[data-focus-section-deck]");
      if (!card || !deck) return false;
      const sectionKey = card.dataset.focusSectionCard;
      deck.dataset.activeSection = sectionKey;
      deck.querySelectorAll("[data-focus-section-card-row] > [data-focus-section-card]").forEach((candidate) => {
        const active = candidate === card;
        candidate.classList.toggle("is-active", active);
        const candidateTrigger = candidate.querySelector(":scope > [data-focus-section-trigger]");
        candidateTrigger?.setAttribute("aria-expanded", String(active));
      });
      deck.querySelectorAll(":scope > [data-focus-section-stage] > [data-focus-section-body]").forEach((body) => {
        const active = body.dataset.focusSectionBody === sectionKey;
        body.classList.toggle("is-active", active);
        body?.setAttribute("aria-hidden", String(!active));
        body?.toggleAttribute("inert", !active);
      });
      return true;
    };

    const revealFocusTarget = (target) => {
      const card = target?.closest?.("[data-focus-section-card]");
      const body = target?.closest?.("[data-focus-section-body]");
      const deck = card?.closest?.("[data-focus-section-deck]") || body?.closest?.("[data-focus-section-deck]");
      const sectionKey = card?.dataset?.focusSectionCard || body?.dataset?.focusSectionBody;
      const trigger = sectionKey ? deck?.querySelector?.('[data-focus-section-trigger="' + CSS.escape(sectionKey) + '"]') : null;
      return trigger ? activateFocusSection(trigger) : false;
    };

    const decisionActionSelector = "[data-human-review-form], [data-goal-tree-decision-form], [data-contract-decision-form], [data-candidate-decision-form], [data-rewire-decision-form], [data-risk-state-form]";

    const activateDecisionFeedItem = (itemId) => {
      setFeedPreset("inbox_message", false);
      setDesktopDirectory("feed", false, false);
      if (desktopWorkSurfaces.length) setDesktopWorkSurface("feed", false, false);
      if (matchMedia("(max-width: 760px)").matches) setMobileView("document");
      let row = [...feedList.querySelectorAll("[data-feed-entry-id]")]
        .find((candidate) => candidate.dataset.feedEntryId === itemId);
      if (row?.hidden) {
        if (feedSearch) feedSearch.value = "";
        if (feedSourceFilter) feedSourceFilter.value = "all";
        if (feedStatusFilter) feedStatusFilter.value = "active";
        filterFeedItems(false);
        row = [...feedList.querySelectorAll("[data-feed-entry-id]")]
          .find((candidate) => candidate.dataset.feedEntryId === itemId);
      }
      if (row && !row.hidden) selectFeedItem(itemId);
      return row;
    };

    const revealDeepLinkTarget = (target) => {
      const decisionDetail = target?.matches?.("[data-feed-detail^='decision:']")
        ? target
        : target?.closest?.("[data-feed-detail^='decision:']");
      let scrollTarget = target;
      if (decisionView && decisionDetail && feedList && feedWorkbench) {
        const itemId = decisionDetail.dataset.feedDetail;
        activateDecisionFeedItem(itemId);
        scrollTarget = decisionDetail.querySelector(decisionActionSelector) || target;
      }
      let disclosure = target?.matches?.("details") ? target : target?.closest?.("details");
      while (disclosure) {
        disclosure.open = true;
        disclosure = disclosure.parentElement?.closest?.("details");
      }
      revealFocusTarget(target);
      return scrollTarget;
    };

    const deepLinkTargetFromId = (targetId) => {
      const directTarget = targetId ? document.getElementById(targetId) : null;
      if (directTarget || !decisionView || !targetId?.startsWith("decision-goal-")) return directTarget;
      const goalId = targetId.slice("decision-goal-".length);
      const itemId = "decision:" + goalId;
      return [...(feedWorkbench?.querySelectorAll("[data-feed-detail]") || [])]
        .find((candidate) => candidate.dataset.feedDetail === itemId) || null;
    };

    const revealDeepLinkFromId = async (targetId, behavior = "auto") => {
      let target = deepLinkTargetFromId(targetId);
      const legacyDecisionGoalId = decisionView && targetId?.startsWith("decision-goal-")
        ? targetId.slice("decision-goal-".length)
        : "";
      if (!target && legacyDecisionGoalId && feedList && feedWorkbench) {
        const itemId = "decision:" + legacyDecisionGoalId;
        activateDecisionFeedItem(itemId);
        if (!(await ensureFeedWorkbenchLoaded())) return null;
        target = [...feedWorkbench.querySelectorAll("[data-feed-detail]")]
          .find((candidate) => candidate.dataset.feedDetail === itemId) || null;
      }
      if (!target) return null;
      const scrollTarget = revealDeepLinkTarget(target);
      requestAnimationFrame(() => {
        scrollTarget.scrollIntoView({ behavior, block: "start" });
        if (scrollTarget.matches?.(decisionActionSelector)) {
          scrollTarget.setAttribute("tabindex", "-1");
          if (!scrollTarget.hasAttribute("aria-label")) {
            scrollTarget.setAttribute(
              "aria-label",
              scrollTarget.querySelector('button[type="submit"]')?.textContent?.trim() || L("待处理决定"),
            );
          }
          scrollTarget.focus({ preventScroll: true });
        }
      });
      return target;
    };

    const setGoalPanel = (panelName, persist = true, updateHash = false, resetScroll = false) => {
      const article = documentPane.querySelector("[data-goal-view]");
      if (!article) return false;
      const panel = goalPanelKeys.includes(panelName) ? panelName : "overview";
      const activePanel = article.querySelector('[data-goal-panel="' + panel + '"]');
      if (!activePanel) return false;
      article.dataset.activePanel = panel;
      article.querySelectorAll("[data-goal-tab]").forEach((button) => {
        const active = button.dataset.goalTab === panel;
        button.setAttribute("aria-selected", String(active));
        button.setAttribute("tabindex", active ? "0" : "-1");
      });
      article.querySelectorAll("[data-goal-panel]").forEach((candidate) => {
        candidate.hidden = candidate !== activePanel;
      });
      if (panel === "records") void loadGoalRecords(article);
      else {
        abortGoalRecordsRequest();
        if (panel !== "overview") void loadGoalPanel(article, panel);
      }
      if (updateHash) history.replaceState(history.state, "", "#" + activePanel.id);
      if (resetScroll) documentPane.scrollTop = 0;
      if (persist) queueSave();
      return true;
    };

    const setGoalFactor = (factorName, persist = true, updateHash = false) => {
      const article = documentPane.querySelector("[data-goal-view]");
      if (!article) return false;
      const factor = goalFactorKeys.includes(factorName) ? factorName : "relations";
      const activePanel = article.querySelector('[data-goal-factor-panel="' + factor + '"]');
      if (!activePanel) {
        article.dataset.activeFactor = factor;
        return false;
      }
      const trigger = article.querySelector('[data-goal-factor-tab="' + factor + '"]');
      if (trigger) activateFocusSection(trigger);
      article.dataset.activeFactor = factor;
      article.querySelectorAll("[data-goal-factor-tab]").forEach((button) => {
        const active = button.dataset.goalFactorTab === factor;
        button.setAttribute("aria-selected", String(active));
        button.setAttribute("tabindex", active ? "0" : "-1");
      });
      if (updateHash) history.replaceState(history.state, "", "#" + activePanel.id);
      if (persist) queueSave();
      return true;
    };

    const resetQuickRecordDialog = (quickDialog) => {
      if (!quickDialog) return;
      const choices = quickDialog.querySelector("[data-quick-record-choices]");
      if (choices) choices.hidden = false;
      quickDialog.querySelectorAll("[data-quick-record-panel]").forEach((panel) => { panel.hidden = true; });
      const title = quickDialog.querySelector("[data-quick-record-title]");
      if (title) title.textContent = L("快速记录");
    };

    const loadAndOpenQuickRecord = async (opener) => {
      const article = opener?.closest?.("[data-goal-view]");
      const goalId = article?.dataset.goalView;
      if (!article || !goalId) return;
      let quickDialog = article.querySelector("[data-quick-record-dialog]");
      if (!quickDialog) {
        quickRecordRequest?.abort();
        const controller = new AbortController();
        quickRecordRequest = controller;
        const original = opener.innerHTML;
        opener.disabled = true;
        opener.setAttribute("aria-busy", "true");
        opener.textContent = L("正在载入…");
        try {
          const response = await fetch(
            route("/api/goals/" + encodeURIComponent(goalId) + "/quick-record?view=" + documentCollection),
            { cache: "no-store", signal: controller.signal },
          );
          if (!response.ok) throw new Error(L("无法打开快速记录"));
          const template = document.createElement("template");
          template.innerHTML = (await response.text()).trim();
          const nextDialog = template.content.querySelector("[data-quick-record-dialog]");
          if (!nextDialog) throw new Error(L("快速记录响应不完整"));
          if (!article.isConnected || article.dataset.goalView !== goalId || quickRecordRequest !== controller) return;
          article.append(nextDialog);
          quickDialog = nextDialog;
          updateAllRelationFormPreviews();
          document.querySelectorAll(".risk-goal-picker").forEach(updateRiskGoalCount);
        } catch (error) {
          if (isAbortError(error) || quickRecordRequest !== controller) return;
          showToast(error instanceof Error ? error.message : L("无法打开快速记录"), true);
          return;
        } finally {
          if (quickRecordRequest === controller) {
            quickRecordRequest = null;
            if (opener.isConnected) {
              opener.disabled = false;
              opener.removeAttribute("aria-busy");
              opener.innerHTML = original;
            }
          }
        }
      }
      if (!quickDialog) return;
      quickDialog._opener = opener;
      resetQuickRecordDialog(quickDialog);
      quickDialog.showModal();
      requestAnimationFrame(() => quickDialog.querySelector("[data-quick-record-type]")?.focus());
    };

    const setTuiWidth = (value, persist = true) => {
      if (!tuiResizer || !workspace.classList.contains("is-desktop-tui")) return;
      const width = Math.round(Math.min(720, Math.max(280, Number(value) || 480)));
      workspace.style.setProperty("--tui-width", width + "px");
      tuiResizer.setAttribute("aria-valuenow", String(width));
      if (persist) queueSave();
    };

    const setTreeWidth = (value, persist = true) => {
      if (matchMedia("(max-width: 760px)").matches && !workspace.classList.contains("is-desktop-tui")) return;
      if (!treeResizer) return;
      const maximum = Math.min(520, Math.max(320, innerWidth * 0.48));
      const width = Math.round(Math.min(maximum, Math.max(260, Number(value) || 320)));
      workspace.style.setProperty("--tree-width", width + "px");
      treeResizer.setAttribute("aria-valuenow", String(width));
      requestAnimationFrame(() => graphAutoFit ? fitGoalGraph(false) : drawGoalGraph());
      if (persist) queueSave();
    };

    const setDirectoryCollapsed = (collapsed, persist = true) => {
      const nextCollapsed = Boolean(collapsed);
      if (nextCollapsed && !workspace.classList.contains("is-directory-collapsed")) {
        const currentWidth = Math.round(treePane?.getBoundingClientRect().width || 0);
        if (currentWidth > 44) workspace.style.setProperty("--tree-width", currentWidth + "px");
      }
      workspace.classList.toggle("is-directory-collapsed", nextCollapsed);
      document.querySelectorAll("[data-directory-toggle]").forEach((button) => {
        button.setAttribute("aria-expanded", String(!nextCollapsed));
        button.setAttribute("aria-label", nextCollapsed ? L("展开目录") : L("收起目录"));
        button.setAttribute("title", nextCollapsed ? L("展开目录") : L("收起目录"));
      });
      treeResizer?.setAttribute("aria-hidden", String(nextCollapsed));
      requestAnimationFrame(() => graphAutoFit ? fitGoalGraph(false) : drawGoalGraph());
      if (persist) queueSave();
    };

    const readUiState = () => {
      rememberFeedPresetState();
      return ({
      selected,
      collapsed: [...document.querySelectorAll("[data-tree-item].is-collapsed")].map((item) => item.dataset.goalId),
      disclosures: [...document.querySelectorAll("[data-persist-open][open]")].map((item) => item.dataset.persistOpen),
      treeTop: treeScroll.scrollTop,
      documentTop: activeDesktopSurface === "goal" ? documentPane.scrollTop : Number(desktopSurfaceScroll.goal || 0),
      workSurface: activeDesktopSurface,
      surfaceScroll: { ...desktopSurfaceScroll, [activeDesktopSurface]: documentPane.scrollTop },
      treeWidth: parseFloat(workspace.style.getPropertyValue("--tree-width")) || treePane.getBoundingClientRect().width,
      tuiWidth: workspace.classList.contains("is-tui-collapsed")
        ? parseFloat(workspace.style.getPropertyValue("--tui-width")) || undefined
        : tuiPane?.getBoundingClientRect().width,
      query: treeSearch.value,
      statuses: [...selectedStatuses],
      mobileView: workspace.dataset.mobileView || "tree",
      navigatorView,
      workspaceMode: activeDesktopSurface === "goal" ? workspace.dataset.workspaceMode || "focus" : goalWorkspaceMode,
      momentumOpenOnly,
      momentumPeriod,
      momentumSelected,
      graphZoom,
      graphAutoFit,
      navigationVersion: desktopNavigationStateVersion,
      directory: treePane?.dataset.desktopDirectory || "root",
      directoryCollapsed: workspace.classList.contains("is-directory-collapsed"),
      feedPreset: activeFeedPreset,
      feedSelected: selectedFeedItem,
      feedQuery: feedSearch?.value || "",
      feedSource: feedSourceFilter?.value || "all",
      feedType: feedTypeFilter?.value || "all",
      feedTime: feedTimeFilter?.value || "all",
      feedStatus: feedStatusFilter?.value || "active",
      feedSort: feedSort?.value || "newest",
      feedPresets: feedPresetState,
      sourceSelected: selectedSource,
      sourceQuery: sourceSearch?.value || "",
      sourceFilter: activeSourceFilter,
      sourceDetailTab: sourceWorkbench?.querySelector('[data-source-detail="' + CSS.escape(selectedSource) + '"] [data-source-detail-tab][aria-selected="true"]')?.dataset.sourceDetailTab || "overview",
      goalPanel: documentPane.querySelector('[data-goal-tab][aria-selected="true"]')?.dataset.goalTab || "overview",
      goalFactor: documentPane.querySelector('[data-goal-factor-tab][aria-selected="true"]')?.dataset.goalFactorTab || "relations",
      });
    };

    const applyUiState = (ui) => {
      desktopSurfaceScroll = ui?.surfaceScroll && typeof ui.surfaceScroll === "object" ? { ...ui.surfaceScroll } : {};
      if (ui?.documentTop != null && desktopSurfaceScroll.goal == null) desktopSurfaceScroll.goal = Number(ui.documentTop || 0);
      goalWorkspaceMode = ui?.workspaceMode || "focus";
      const requestedDesktopSurface = ui?.workSurface || (decisionView ? "feed" : "goal");
      const nextDesktopSurface = desktopWorkSurfaces.some((candidate) => candidate.dataset.workSurface === requestedDesktopSurface)
        ? requestedDesktopSurface
        : decisionView ? "feed" : "goal";
      if (ui?.treeWidth) setTreeWidth(ui.treeWidth, false);
      if (ui?.tuiWidth) setTuiWidth(ui.tuiWidth, false);
      setDirectoryCollapsed(ui?.directoryCollapsed === true, false);
      if (desktopDirectoryPanels.length) {
        const restoredDirectory = ui?.navigationVersion === desktopNavigationStateVersion
          ? ui?.directory || (decisionView ? "feed" : "root")
          : decisionView ? "feed" : "root";
        setDesktopDirectory(restoredDirectory, false, false);
      }
      const collapsed = new Set(ui?.collapsed || []);
      document.querySelectorAll("[data-tree-item]").forEach((item) => {
        const isCollapsed = collapsed.has(item.dataset.goalId);
        item.classList.toggle("is-collapsed", isCollapsed);
        item.querySelector(":scope > .tree-row [data-tree-toggle]")?.setAttribute("aria-expanded", String(!isCollapsed));
      });
      const disclosures = new Set(ui?.disclosures || []);
      document.querySelectorAll("[data-persist-open]").forEach((item) => {
        item.open = disclosures.has(item.dataset.persistOpen);
      });
      treeSearch.value = ui?.query || "";
      setSelectedStatuses(ui?.statuses || []);
      momentumOpenOnly = ui?.momentumOpenOnly === true;
      momentumPeriod = Number(ui?.momentumPeriod) === 30 ? 30 : 7;
      momentumSelected = String(ui?.momentumSelected || selected || "");
      graphZoom = Number(ui?.graphZoom) || graphZoom;
      graphAutoFit = ui?.graphAutoFit !== false;
      filterTree(ui?.query || "");
      if (feedDirectory) {
        const deepLinkedDecisionEntry = decisionFeedEntryFromHash();
        activeFeedPreset = deepLinkedDecisionEntry ? "inbox_message" : ui?.feedPreset === "feed" ? "feed" : "inbox_message";
        const persistedPresets = ui?.feedPresets && typeof ui.feedPresets === "object"
          ? ui.feedPresets
          : {};
        feedPresetState = {
          inbox_message: { ...defaultFeedPresetState(), ...(persistedPresets.inbox_message || {}) },
          feed: { ...defaultFeedPresetState(), ...(persistedPresets.feed || {}) },
        };
        if (!ui?.feedPresets) {
          feedPresetState[activeFeedPreset] = {
            selected: String(ui?.feedSelected || selectedFeedItem || ""),
            query: String(ui?.feedQuery || ""),
            source: ui?.feedSource || "all",
            type: ui?.feedType || "all",
            time: ui?.feedTime || "all",
            status: ui?.feedStatus || "active",
            sort: ui?.feedSort || "newest",
          };
        }
        if (deepLinkedDecisionEntry) {
          feedPresetState.inbox_message = {
            ...feedPresetState.inbox_message,
            selected: deepLinkedDecisionEntry,
            query: "",
            source: "all",
            type: "all",
            time: "all",
            status: "active",
          };
        }
        setFeedPreset(activeFeedPreset, true);
      }
      const restoredSourceDetailTab = String(ui?.sourceDetailTab || "overview");
      if (sourceDirectory) {
        const availableSourceFilters = new Set(["all", "account", "public", "attention"]);
        activeSourceFilter = availableSourceFilters.has(ui?.sourceFilter) ? ui.sourceFilter : "all";
        selectedSource = String(ui?.sourceSelected || selectedSource || "");
        if (sourceSearch) sourceSearch.value = String(ui?.sourceQuery || "");
        sourceDirectory.querySelectorAll("[data-source-filter]").forEach((button) => {
          const active = button.dataset.sourceFilter === activeSourceFilter;
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", String(active));
        });
        filterSources(true);
        if (selectedSource) selectSource(selectedSource, false);
      }
      setWorkspaceMode(ui?.workspaceMode || (ui?.navigatorView === "graph" ? "graph" : "focus"), false);
      if (desktopWorkSurfaces.length) setDesktopWorkSurface(nextDesktopSurface, false, false);
      if (nextDesktopSurface === "feed" && selectedFeedItem) {
        selectFeedItem(selectedFeedItem, false, true);
      }
      if (nextDesktopSurface === "sources" && selectedSource) {
        const selectedDetail = sourceWorkbench?.querySelector('[data-source-detail="' + CSS.escape(selectedSource) + '"]');
        setSourceDetailTab(selectedDetail, restoredSourceDetailTab);
      }
      bindGoalGraphViewport();
      if (graphAutoFit) requestAnimationFrame(() => fitGoalGraph(false));
      else setGraphZoom(graphZoom, false, false);
      setGoalPanel(goalPanelFromHash() || (ui?.selected === selected ? ui?.goalPanel : "overview"), false);
      setGoalFactor(goalFactorFromHash() || (ui?.selected === selected ? ui?.goalFactor : "relations"), false);
      const hashTargetId = decodeURIComponent(location.hash.slice(1));
      const hashTarget = hashTargetId ? document.getElementById(hashTargetId) : null;
      treeScroll.scrollTop = Number(ui?.treeTop || 0);
      documentPane.scrollTop = hashTarget?.matches?.("[data-goal-panel]") && activeDesktopSurface === "goal"
        ? 0
        : activeDesktopSurface === "goal" && ui?.selected === selected
          ? Number(ui?.documentTop || 0)
          : Number(desktopSurfaceScroll[activeDesktopSurface] || 0);
      const restoredMobileView = desktopCompanionActive && selected ? "document" : ui?.mobileView || "tree";
      if (matchMedia("(max-width: 760px)").matches) {
        if (restoredMobileView === "tui") setWorkspaceMode("runtime", false);
        if (restoredMobileView === "document") setWorkspaceMode("focus", false);
`;

