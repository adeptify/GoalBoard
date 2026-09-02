/** AP3 Workbench client segment: events-secondary. */
export const CLIENT_EVENTS_SECONDARY_SCRIPT = `        return;
      }
      if (target.closest("[data-feed-gmail-oauth-start]")) {
        const button = target.closest("[data-feed-gmail-oauth-start]");
        const clientId = feedSourcesDialog?.querySelector("[data-feed-gmail-client-id]")?.value || "";
        const clientSecret = feedSourcesDialog?.querySelector("[data-feed-gmail-client-secret]")?.value || "";
        button.disabled = true;
        try {
          const result = await feedApi("/api/feed/connectors/gmail/oauth/start", "POST", {
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: location.origin + route("/api/feed/connectors/gmail/oauth/callback"),
          });
          location.assign(result.authorizationUrl);
        } catch (error) {
          setFeedSourceFeedback(error.message || L("Gmail 授权启动失败"), true);
          button.disabled = false;
        }
        return;
      }
      if (target.closest("[data-relay-import-open]")) {
        feedSourcesDialog?.close();
        relayImportDialog?.showModal();
        return;
      }
      if (target.closest("[data-relay-import-confirm]")) {
        const button = target.closest("[data-relay-import-confirm]");
        const errorBox = relayImportDialog?.querySelector("[data-relay-import-error]");
        const original = button.textContent;
        button.disabled = true;
        button.textContent = L("正在迁移…");
        if (errorBox) errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/feed/import"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({ user_confirmed: true }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("Relay 迁移失败"));
          saveUiState();
          location.reload();
        } catch (error) {
          if (errorBox) {
            errorBox.textContent = error.message || L("Relay 迁移失败");
            errorBox.hidden = false;
          }
          button.disabled = false;
          button.textContent = original;
        }
        return;
      }
      if (target.closest("[data-feed-clear-filters]")) {
        if (feedSearch) feedSearch.value = "";
        if (feedSourceFilter) feedSourceFilter.value = "all";
        if (feedTypeFilter) feedTypeFilter.value = "all";
        if (feedTimeFilter) feedTimeFilter.value = "all";
        if (feedStatusFilter) feedStatusFilter.value = "active";
        if (feedSort) feedSort.value = "newest";
        syncFeedFilterUi();
        setFeedFilterOpen(false);
        filterFeedItems(false);
        return;
      }
      if (target.closest("[data-retry-feed-detail]")) {
        if (feedWorkbench?.dataset.loaded !== "true") {
          void ensureFeedWorkbenchLoaded();
          return;
        }
        const selectedRow = [...(feedList?.querySelectorAll("[data-feed-entry-id]") || [])]
          .find((row) => row.dataset.feedEntryId === selectedFeedItem);
        if (selectedRow) void loadFeedItemDetail(selectedRow, selectedFeedItem);
        return;
      }
      const openSourceRecord = target.closest("[data-open-source-record]");
      if (openSourceRecord) {
        const sourceId = openSourceRecord.dataset.openSourceRecord;
        if (!sourceId || !sourceList?.querySelector('[data-source-entry-id="' + CSS.escape(sourceId) + '"]')) {
          showToast(L("这个来源已删除或暂时不可用"));
          return;
        }
        setDesktopDirectory("sources", true, false, openSourceRecord);
        setDesktopWorkSurface("sources", true, false);
        selectSource(sourceId, true);
        return;
      }
      const feedEntry = target.closest("[data-feed-entry-id]");
      if (feedEntry) {
        selectFeedItem(feedEntry.dataset.feedEntryId, true, true);
        return;
      }
      const inboxOpenFeed = target.closest("[data-inbox-open-feed]");
      if (inboxOpenFeed) {
        const itemId = inboxOpenFeed.dataset.inboxOpenFeed;
        if (!itemId) return;
        setFeedPreset("feed", true);
        setDesktopDirectory("feed", true, false, inboxOpenFeed);
        setDesktopWorkSurface("feed", true, false);
        selectFeedItem(itemId, true, true);
        return;
      }
      const inboxAction = target.closest("[data-inbox-action]");
      if (inboxAction) {
        const statusValue = inboxAction.dataset.inboxAction;
        const entryId = inboxAction.dataset.inboxEntryId;
        const expectedRevision = Number(inboxAction.dataset.inboxEntryRevision || 0) || undefined;
        if (!statusValue || !entryId || !expectedRevision) return;
        const status = inboxAction.closest("[data-feed-detail]")?.querySelector("[data-inbox-action-status], [data-feed-action-status]");
        const original = inboxAction.innerHTML;
        inboxAction.disabled = true;
        inboxAction.setAttribute("aria-busy", "true");
        if (status) status.hidden = true;
        try {
          await feedApi("/api/inbox/entries/" + encodeURIComponent(entryId) + "/status", "POST", {
            status: statusValue,
            expected_revision: expectedRevision,
          });
          saveUiState();
          location.reload();
        } catch (error) {
          if (status) {
            status.textContent = error.message || L("Inbox 操作失败");
            status.hidden = false;
          }
          inboxAction.disabled = false;
          inboxAction.removeAttribute("aria-busy");
          inboxAction.innerHTML = original;
        }
        return;
      }
      const feedAction = target.closest("[data-feed-action]");
      if (feedAction) {
        const action = feedAction.dataset.feedAction;
        const itemId = feedAction.dataset.feedItemId;
        if (!action || !itemId) return;
        const status = feedAction.closest("[data-feed-detail]")?.querySelector("[data-feed-action-status]");
        const original = feedAction.innerHTML;
        feedAction.disabled = true;
        feedAction.setAttribute("aria-busy", "true");
        if (status) status.hidden = true;
        try {
          const expectedRevision = Number(feedAction.dataset.feedRevision || 0) || undefined;
          const restoreTarget = feedAction.dataset.feedRestoreTarget;
          const response = await fetch(route("/api/feed/items/" + encodeURIComponent(itemId) + "/" + action), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify(expectedRevision
              ? { expected_revision: expectedRevision, ...(restoreTarget ? { restore_target: restoreTarget } : {}) }
              : {}),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("Item 操作失败"));
          if (action === "promote" || action === "start") {
            saveUiState();
            let existing = {};
            try { existing = JSON.parse(sessionStorage.getItem(currentGoalUiStorageKey) || sessionStorage.getItem(goalUiStorageKey) || "null") || {}; } catch {}
            if (action === "start" && result.runtime_autofill && result.goal_id) {
              sessionStorage.setItem("goalboard-feed-runtime-autofill:" + result.goal_id, JSON.stringify({ itemId, at: Date.now() }));
            }
            sessionStorage.setItem(currentGoalUiStorageKey, JSON.stringify({
              ...existing,
              selected: result.goal_id,
              navigationVersion: desktopNavigationStateVersion,
              directory: "goals",
              workSurface: "goal",
              workspaceMode: action === "start" ? "runtime" : "focus",
              mobileView: action === "start" ? "tui" : "document",
            }));
            location.assign(globalThis.goalboardNavigationUrl(result.goal_path + (action === "start" ? "?feed-start=1" : "")));
            return;
          }
          saveUiState();
          location.reload();
        } catch (error) {
          if (status) {
            status.textContent = error.message || L("Item 操作失败");
            status.hidden = false;
          }
          feedAction.disabled = false;
          feedAction.removeAttribute("aria-busy");
          feedAction.innerHTML = original;
        }
        return;
      }
      const surfaceLink = target.closest("[data-work-surface-link]");
      if (surfaceLink) {
        saveUiState();
        const surface = surfaceLink.dataset.workSurfaceLink || "inbox";
        if (desktopWorkSurfaces.some((candidate) => candidate.dataset.workSurface === surface)) {
          event.preventDefault();
          setDesktopDirectory("root", true, false, surfaceLink);
          setDesktopWorkSurface(surface, true, true);
          if (surface === "feed" && selectedFeedItem) selectFeedItem(selectedFeedItem, false, true);
        }
        return;
      }
      const surfaceOpen = target.closest("[data-work-surface-open]");
      if (surfaceOpen) {
        const surface = surfaceOpen.dataset.workSurfaceOpen || "goal";
        if (surface === "feed") {
          setFeedPreset(surfaceOpen.dataset.feedPreset || "inbox_message", true);
          const source = surfaceOpen.dataset.feedSource;
          if (source) {
            if (feedSearch) feedSearch.value = "";
            if (feedSourceFilter) {
              feedSourceFilter.value = source;
              if (!feedSourceFilter.value) feedSourceFilter.value = "all";
            }
            if (feedTypeFilter) feedTypeFilter.value = "all";
            if (feedTimeFilter) feedTimeFilter.value = "all";
            if (feedStatusFilter) feedStatusFilter.value = "active";
            if (feedSort) feedSort.value = "newest";
            syncFeedFilterUi();
            filterFeedItems(false);
          }
        }
        const available = desktopWorkSurfaces.some((candidate) => candidate.dataset.workSurface === surface);
        if (surface === "goal" && (decisionView || !available)) {
          saveUiState();
          restoreLastGoal(true);
          return;
        }
        setDesktopDirectory(surface === "goal"
          ? "goals"
          : surface === "feed" || surface === "sources" || surface === "sessions"
            ? surface
            : "root", true, true, surfaceOpen);
        setDesktopWorkSurface(surface, true, true);
        if (surface === "feed" && selectedFeedItem) selectFeedItem(selectedFeedItem, false, true);
        if (matchMedia("(max-width: 760px)").matches) setMobileView("tree");
        return;
      }
      const directoryOpen = target.closest("[data-directory-open]");
      if (directoryOpen && desktopDirectoryPanels.length) {
        if (directoryOpen.matches("[data-mobile-directory-root]")) setMobileView("tree");
        setDesktopDirectory(directoryOpen.dataset.directoryOpen || "root", true, true, directoryOpen);
        return;
      }
      if (target.closest("[data-directory-back]") && desktopDirectoryPanels.length) {
        setDesktopDirectory("root");
        return;
      }
      const closeWorkTab = target.closest("[data-close-work-tab]");
      if (closeWorkTab && workTabs && !decisionView && !collectionView) {
        const goalId = closeWorkTab.dataset.closeWorkTab;
        const index = openWorkTabs.indexOf(goalId);
        if (index < 0) return;
        if (openWorkTabs.length === 1) {
          showToast(L("至少保留一个打开的 Goal"));
          return;
        }
        openWorkTabs.splice(index, 1);
        persistWorkTabs();
        if (goalId === selected) {
          const nextGoalId = openWorkTabs[Math.min(index, openWorkTabs.length - 1)];
          if (nextGoalId) {
            await selectGoal(nextGoalId);
            focusWorkTab(nextGoalId);
          }
        } else {
          renderWorkTabs();
          focusWorkTab(selected);
        }
        return;
      }
      const workTab = target.closest("[data-work-tab]");
      if (workTab) {
        setDesktopDirectory("goals", true, false, workTab);
        setDesktopWorkSurface("goal", true, true);
        await selectGoal(workTab.dataset.workTab);
        return;
      }
      if (target.closest("[data-personal-search]")) {
        treeSearch?.focus();
        treeSearch?.select();
        return;
      }
      const loadMoreEventsButton = target.closest("[data-load-more-goal-events]");
      if (loadMoreEventsButton) {
        await loadMoreGoalEvents(loadMoreEventsButton);
        return;
      }
      if (!treeFilter?.hidden && !target.closest("[data-tree-filter], [data-tree-filter-trigger]")) setTreeFilterOpen(false);
      if (target.closest("[data-clear-status-filter]")) {
        setSelectedStatuses([]);
        filterTree(treeSearch.value);
        queueSave();
        return;
      }
      if (target.closest("[data-clear-tree-filter]")) {
        treeSearch.value = "";
        setSelectedStatuses([]);
        filterTree("");
        queueSave();
        return;
      }
      const treeToggle = target.closest("[data-tree-toggle]");
      if (treeToggle) {
        const item = treeToggle.closest("[data-tree-item]");
        const collapsed = item.classList.toggle("is-collapsed");
        treeToggle.setAttribute("aria-expanded", String(!collapsed));
        saveUiState();
        return;
      }
      if (target.closest("[data-retry-goal-momentum]")) {
        void loadGoalGraph();
        return;
      }
      const navigatorViewButton = target.closest("button[data-navigator-view]");
      if (navigatorViewButton) {
        setNavigatorView(navigatorViewButton.dataset.navigatorView);
        return;
      }
      const workbenchViewButton = target.closest("button[data-workbench-view]");
      if (workbenchViewButton) {
        setWorkspaceMode(workbenchViewButton.dataset.workbenchView);
        return;
      }
      if (target.closest("[data-tui-focus-return]")) {
        setWorkspaceMode("focus");
        return;
      }
      if (target.closest("[data-directory-toggle]")) {
        setDirectoryCollapsed(!workspace.classList.contains("is-directory-collapsed"));
        return;
      }
      const momentumFilterButton = target.closest("[data-momentum-filter]");
      if (momentumFilterButton) {
        momentumOpenOnly = momentumFilterButton.dataset.momentumFilter === "open";
        updateGraphVisibility();
        queueSave();
        return;
      }
      const momentumPeriodButton = target.closest("[data-momentum-period]");
      if (momentumPeriodButton) {
        setMomentumPeriod(momentumPeriodButton.dataset.momentumPeriod);
        return;
      }
      const momentumSelectButton = target.closest("[data-momentum-select], [data-momentum-node]");
      if (momentumSelectButton) {
        updateMomentumSelection(momentumSelectButton.dataset.momentumSelect || momentumSelectButton.dataset.goalId);
        return;
      }
      if (target.closest("[data-companion-runtime-open]")) {
        setWorkspaceMode("runtime");
        return;
      }
      const graphZoomButton = target.closest("[data-graph-zoom]");
      if (graphZoomButton) {
        const action = graphZoomButton.dataset.graphZoom;
        if (action === "fit") {
          fitGoalGraph();
        } else {
          setGraphZoom(action === "in" ? graphZoom + .1 : graphZoom - .1, true, false);
        }
        return;
      }
      const goalLink = target.closest("[data-select-goal]");
      if (goalLink) {
        selectGoal(goalLink.dataset.selectGoal);
        return;
      }
      if (target.closest("[data-open-create]")) {
        formError.hidden = true;
        dialog.showModal();
        updateRelationPreviews();
        requestAnimationFrame(() => form.elements.title.focus());
        return;
      }
      if (target.closest("[data-close-create]")) {
        dialog.close();
        refreshBoard();
        return;
      }
      const trashAction = target.closest("[data-open-goal-trash]");
      if (trashAction) {
        openGoalTrashDialog(trashAction, true);
        return;
      }
      const restoreAction = target.closest("[data-open-goal-restore]");
      if (restoreAction) {
        openGoalTrashDialog(restoreAction, false);
        return;
      }
      if (target.closest("[data-close-goal-trash]")) {
        closeGoalTrashDialog();
        return;
      }
      if (target.closest("[data-collapse-all]")) {
        const items = [...document.querySelectorAll("[data-tree-item]")];
        const shouldCollapse = items.some((item) => !item.classList.contains("is-collapsed"));
        items.forEach((item) => item.classList.toggle("is-collapsed", shouldCollapse));
        document.querySelectorAll("[data-tree-toggle]").forEach((button) => {
          button.setAttribute("aria-expanded", String(!shouldCollapse));
        });
        saveUiState();
        return;
      }
      const mobileTarget = target.closest("[data-mobile-target]");
      if (mobileTarget) {
        const mobileView = mobileTarget.dataset.mobileTarget;
        if (mobileView === "document") setWorkspaceMode("focus", false);
        if (mobileView === "tui") setWorkspaceMode("runtime", false);
        setMobileView(mobileView);
        saveUiState();
        return;
      }
      const goalTab = target.closest("[data-goal-tab]");
      if (goalTab) {
        setGoalPanel(goalTab.dataset.goalTab, true, true, true);
        return;
      }
      const retryGoalPanel = target.closest("[data-retry-goal-panel]");
      if (retryGoalPanel) {
        const article = retryGoalPanel.closest("[data-goal-view]");
        void loadGoalPanel(article, retryGoalPanel.dataset.retryGoalPanel);
        return;
      }
      const focusSectionTrigger = target.closest("[data-focus-section-trigger]");
      if (focusSectionTrigger) {
        const factor = focusSectionTrigger.dataset.goalFactorTab;
        if (factor) setGoalFactor(factor, true, true);
        else activateFocusSection(focusSectionTrigger);
        return;
      }
      const factorTab = target.closest("[data-goal-factor-tab]");
      if (factorTab) {
        setGoalFactor(factorTab.dataset.goalFactorTab, true, true);
        return;
      }
      const openQuickRecord = target.closest("[data-open-quick-record]");
      if (openQuickRecord) {
        await loadAndOpenQuickRecord(openQuickRecord);
        return;
      }
      const closeQuickRecord = target.closest("[data-close-quick-record]");
      if (closeQuickRecord) {
        const quickDialog = closeQuickRecord.closest("[data-quick-record-dialog]");
        quickDialog?.close();
        resetQuickRecordDialog(quickDialog);
        quickDialog?._opener?.focus();
        return;
      }
      const quickRecordType = target.closest("[data-quick-record-type]");
      if (quickRecordType) {
        const quickDialog = quickRecordType.closest("[data-quick-record-dialog]");
        const choices = quickDialog?.querySelector("[data-quick-record-choices]");
        const panel = quickDialog?.querySelector('[data-quick-record-panel="' + quickRecordType.dataset.quickRecordType + '"]');
        if (!quickDialog || !panel) return;
        if (choices) choices.hidden = true;
        quickDialog.querySelectorAll("[data-quick-record-panel]").forEach((candidate) => { candidate.hidden = candidate !== panel; });
        const title = quickDialog.querySelector("[data-quick-record-title]");
        if (title) title.textContent = quickRecordType.querySelector("strong")?.textContent || L("快速记录");
        requestAnimationFrame(() => panel.querySelector("input:not([type=hidden]), textarea, select")?.focus());
        return;
      }
      const quickRecordBack = target.closest("[data-quick-record-back]");
      if (quickRecordBack) {
        const quickDialog = quickRecordBack.closest("[data-quick-record-dialog]");
        resetQuickRecordDialog(quickDialog);
        requestAnimationFrame(() => quickDialog?.querySelector("[data-quick-record-type]")?.focus());
        return;
      }
      if (target.closest("[data-open-goal-edit]")) {
        setGoalPanel("completion", true, true, true);
        const editor = document.querySelector(".goal-edit-disclosure");
        if (editor) {
          editor.open = true;
          editor.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
          requestAnimationFrame(() => editor.querySelector("input, textarea, select")?.focus());
        }
        return;
      }
      if (target.closest("[data-open-goal-tui]")) {
        setWorkspaceMode("runtime");
        const addTerminal = document.querySelector("[data-tui-add]");
        if (addTerminal) addTerminal.click();
        return;
      }
      const sectionLink = target.closest('a[href^="#"]');
      if (sectionLink) {
        const targetId = sectionLink.getAttribute("href")?.slice(1);
        const targetElement = targetId ? document.getElementById(targetId) : null;
        const targetPanel = targetId ? goalPanelFromTargetId(targetId) : "";
        const targetFactor = targetId ? goalFactorFromTargetId(targetId) : "";
        if (targetId && (targetElement || targetPanel || targetFactor)) {
          event.preventDefault();
          if (targetPanel) setGoalPanel(targetPanel, true);
          if (targetFactor) setGoalFactor(targetFactor, true);
          history.replaceState(null, "", "#" + targetId);
          if (targetElement) {
            const deepLinkScrollTarget = revealDeepLinkTarget(targetElement);
            requestAnimationFrame(() => deepLinkScrollTarget.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
          }
          return;
        }
      }
      const copy = target.closest("[data-copy-value]");
      if (copy) {
        try {
          await navigator.clipboard.writeText(copy.dataset.copyValue);
          showToast("引用已复制");
        } catch {
          showToast("无法访问剪贴板，请手动复制", true);
        }
        return;
      }
      const openRelationDeactivate = target.closest("[data-relation-deactivate-open]");
      if (openRelationDeactivate) {
        const record = openRelationDeactivate.closest("[data-relation-id]");
        const deactivateForm = record?.querySelector("[data-relation-deactivate-form]");
        if (!deactivateForm) return;
        deactivateForm.hidden = false;
        openRelationDeactivate.hidden = true;
        openRelationDeactivate.setAttribute("aria-expanded", "true");
        deactivateForm.querySelector("textarea")?.focus();
        return;
      }
      const cancelRelationDeactivate = target.closest("[data-relation-deactivate-cancel]");
      if (cancelRelationDeactivate) {
        const record = cancelRelationDeactivate.closest("[data-relation-id]");
        const deactivateForm = record?.querySelector("[data-relation-deactivate-form]");
        const openButton = record?.querySelector("[data-relation-deactivate-open]");
        if (deactivateForm) deactivateForm.hidden = true;
        if (openButton) {
          openButton.hidden = false;
          openButton.setAttribute("aria-expanded", "false");
          openButton.focus();
        }
        return;
      }
      const addCriterion = target.closest("[data-add-criterion]");
      if (addCriterion) {
        const editor = addCriterion.closest("[data-draft-editor]");
        const list = editor?.querySelector("[data-criteria-list]");
        const template = editor?.querySelector("[data-criterion-template]");
        if (list && template) {
          list.append(template.content.cloneNode(true));
          renumberCriteria(list);
          list.lastElementChild?.querySelector('[data-criterion-field="statement"]')?.focus();
        }
        return;
      }
      const removeCriterion = target.closest("[data-remove-criterion]");
      if (removeCriterion) {
        const row = removeCriterion.closest("[data-criterion-row]");
        const list = row?.parentElement;
        if (!row || !list) return;
        if (list.querySelectorAll("[data-criterion-row]").length === 1) {
          row.querySelectorAll("input, textarea").forEach((control) => { control.value = ""; });
          const method = row.querySelector('[data-criterion-field="decision_method"]');
          if (method) method.value = "inspection";
        } else {
          row.remove();
          renumberCriteria(list);
        }
        return;
      }
      const archiveAction = target.closest("[data-goal-archive]");
      const activeGoalAction = target.closest("[data-set-active-goal]");
      if (activeGoalAction) {
        activeGoalAction.disabled = true;
        const goalId = activeGoalAction.dataset.goalId;
        try {
          const response = await fetch(route("/api/goals/" + encodeURIComponent(goalId) + "/active"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({ reason: "用户在 GoalBoard 设为当前 Goal" }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "无法设为当前 Goal");
          await refreshBoard(true);
          showToast("已设为当前 Goal；Runtime 的执行状态没有改变");
        } catch (error) {
          activeGoalAction.disabled = false;
          showToast(error.message || "无法设为当前 Goal", true);
        }
        return;
      }
      if (archiveAction) {
        archiveAction.disabled = true;
        const archived = archiveAction.dataset.goalArchive === "true";
        const goalId = archiveAction.dataset.goalId;
        try {
          const response = await fetch(route("/api/goals/" + encodeURIComponent(goalId) + "/archive"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({
              archived,
              reason: archived ? "用户在 GoalBoard 手动归档已完成 Goal" : "用户在 GoalBoard 恢复归档 Goal",
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "操作失败");
          location.assign(globalThis.goalboardNavigationUrl(route((archived ? "/archive/goals/" : "/goals/") + encodeURIComponent(goalId))));
        } catch (error) {
          archiveAction.disabled = false;
          showToast(error.message || "操作失败", true);
        }
        return;
`;

