/** AP3 Workbench client segment: refresh-decisions. */
export const CLIENT_REFRESH_DECISIONS_SCRIPT = `      }
      setMobileView(restoredMobileView);
      if (hashTargetId) void revealDeepLinkFromId(hashTargetId);
    };

    const saveUiState = () => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(readUiState()));
      } catch {}
    };

    const queueSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveUiState, 120);
    };

    const expandAncestors = (node) => {
      let parent = node?.closest(".tree-item")?.parentElement?.closest(".tree-item");
      while (parent) {
        parent.classList.remove("is-collapsed");
        parent.querySelector(":scope > .tree-row [data-tree-toggle]")?.setAttribute("aria-expanded", "true");
        parent = parent.parentElement?.closest(".tree-item");
      }
    };

    const applySelection = (goalId, resetScroll) => {
      const item = visibleGoals().find((entry) => entry.goal.goal_id === goalId);
      if (!item) return false;
      selected = goalId;
      momentumSelected = goalId;
      document.querySelector("[data-tui-pane]")?.setAttribute("data-goal-id", goalId);
      document.dispatchEvent(new CustomEvent("goalboard:goal-changed", { detail: {
        goalId,
        goalTitle: item.goal.title,
        status: item.status,
        statusLabel: item.status_label,
        statusMeaning: item.status_meaning,
        statusIconMarkup: item.status_icon,
        parentReadOnly: Boolean(item.is_compound_parent),
        children: item.children || [],
      } }));
      document.querySelectorAll(".tree-node[data-select-goal]").forEach((button) => {
        const active = button.dataset.selectGoal === goalId;
        button.classList.toggle("is-selected", active);
        button.setAttribute("aria-pressed", String(active));
        if (active) expandAncestors(button);
      });
      if (navigatorView === "graph") updateGraphVisibility();
      document.title = item.goal.title + " · GoalBoard";
      if (resetScroll && activeDesktopSurface === "goal") documentPane.scrollTop = 0;
      renderWorkTabs();
      return true;
    };

    const replaceGoalDocument = (html) => {
      abortGoalPanelRequest();
      quickRecordRequest?.abort();
      const template = document.createElement("template");
      template.innerHTML = String(html || "").trim();
      const nextView = template.content.querySelector("[data-goal-view]");
      if (!nextView) throw new Error("Goal 正文响应不完整");
      const goalSurface = documentPane.querySelector('[data-work-surface="goal"]');
      const paneHeader = goalSurface ? null : documentPane.querySelector(":scope > .desktop-pane-header");
      if (goalSurface) goalSurface.replaceChildren(nextView);
      else documentPane.replaceChildren(...(paneHeader ? [paneHeader, nextView] : [nextView]));
      updateAllRelationFormPreviews();
      document.querySelectorAll("[data-risk-state-form]").forEach(updateRiskStatePreview);
      document.querySelectorAll(".risk-goal-picker").forEach(updateRiskGoalCount);
      setGoalPanel(goalPanelFromHash() || "overview", false);
      setGoalFactor(goalFactorFromHash() || "relations", false);
    };

    const setGoalDocumentBusy = (busy) => {
      if (busy) documentPane.setAttribute("aria-busy", "true");
      else documentPane.removeAttribute("aria-busy");
      documentPane.querySelector("[data-goal-document-loading]")?.remove();
      if (!busy) return;
      const indicator = document.createElement("div");
      indicator.className = "goal-document-loading";
      indicator.dataset.goalDocumentLoading = "true";
      indicator.setAttribute("role", "status");
      indicator.textContent = L("正在载入 Goal…");
      const goalSurface = documentPane.querySelector('[data-work-surface="goal"]');
      const paneHeader = goalSurface ? null : documentPane.querySelector(":scope > .desktop-pane-header");
      if (paneHeader) paneHeader.after(indicator);
      else (goalSurface || documentPane).prepend(indicator);
    };

    const loadGoalDocument = async (goalId) => {
      goalDocumentRequest?.abort();
      const controller = new AbortController();
      goalDocumentRequest = controller;
      setGoalDocumentBusy(true);
      try {
        const response = await fetch(
          route("/api/goals/" + encodeURIComponent(goalId) + "/document?view=" + documentCollection),
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error("无法读取这条 Goal 正文");
        const html = await response.text();
        if (goalDocumentRequest !== controller) return null;
        replaceGoalDocument(html);
        return true;
      } catch (error) {
        if (isAbortError(error) || goalDocumentRequest !== controller) return null;
        showToast(error.message || "无法读取这条 Goal 正文", true);
        return false;
      } finally {
        if (goalDocumentRequest === controller) {
          goalDocumentRequest = null;
          setGoalDocumentBusy(false);
        }
      }
    };

    const selectGoal = async (goalId, updateHistory = true) => {
      if (decisionView) {
        location.assign(globalThis.goalboardNavigationUrl(route("/goals/" + encodeURIComponent(goalId))));
        return;
      }
      const currentView = documentPane.querySelector("[data-goal-view]");
      if (goalId === selected && currentView?.dataset.goalView === goalId) {
        if (matchMedia("(max-width: 760px)").matches) setWorkspaceMode("focus", false);
        return;
      }
      const fallbackGoalId = currentView?.dataset.goalView || selected;
      if (!applySelection(goalId, true)) return;
      abortGoalRecordsRequest();
      const loaded = await loadGoalDocument(goalId);
      if (loaded == null) return;
      if (!loaded) {
        if (selected === goalId && fallbackGoalId) applySelection(fallbackGoalId, false);
        return;
      }
      ensureWorkTab(goalId);
      document.dispatchEvent(new CustomEvent("goalboard:goal-document-loaded", { detail: { goalId } }));
      if (updateHistory) {
        history.pushState({ goalId }, "", goalPageUrl(goalId));
      }
      if (matchMedia("(max-width: 760px)").matches) setWorkspaceMode("focus", false);
      saveUiState();
    };

    function setSelectedStatuses(values) {
      const available = new Set([...document.querySelectorAll("[data-status-filter]")].map((input) => input.value));
      selectedStatuses = new Set((Array.isArray(values) ? values : []).filter((status) => available.has(status)));
      document.querySelectorAll("[data-status-filter]").forEach((input) => {
        input.checked = selectedStatuses.has(input.value);
      });
      const selectedCount = selectedStatuses.size;
      const summary = treeFilter?.querySelector("[data-tree-filter-summary]");
      const clear = treeFilter?.querySelector("[data-clear-status-filter]");
      if (summary) summary.textContent = selectedCount ? L("已选择 {count} 种状态", { count: selectedCount }) : L("显示全部状态");
      if (clear) clear.disabled = selectedCount === 0;
      treeFilterTrigger?.classList.toggle("is-active", selectedCount > 0);
      treeFilterTrigger?.setAttribute("aria-label", selectedCount ? L("筛选目标，已选择 {count} 种状态", { count: selectedCount }) : L("筛选目标"));
    }

    function setTreeFilterOpen(open, focusFirst = false) {
      if (!treeFilter || !treeFilterTrigger) return;
      treeFilter.hidden = !open;
      treeFilterTrigger.setAttribute("aria-expanded", String(open));
      if (open && focusFirst) {
        requestAnimationFrame(() => {
          if (treeFilter.hidden) return;
          const firstStatusFilter = treeFilter.querySelector("[data-status-filter]");
          if (firstStatusFilter instanceof HTMLElement) firstStatusFilter.focus({ preventScroll: true });
        });
      }
    }

    function filterTree(value) {
      const query = value.trim().toLowerCase();
      const items = [...document.querySelectorAll("[data-tree-item]")];
      const matched = items.filter((item) => {
        const matchesQuery = !query || String(item.dataset.goalSearch || "").includes(query);
        const matchesStatus = selectedStatuses.size === 0 || selectedStatuses.has(item.dataset.goalStatus);
        item.hidden = !(matchesQuery && matchesStatus);
        return !item.hidden;
      });
      if (query || selectedStatuses.size) {
        matched.forEach((item) => {
          let parent = item.parentElement?.closest("[data-tree-item]");
          while (parent) {
            parent.hidden = false;
            parent.classList.remove("is-collapsed");
            parent = parent.parentElement?.closest("[data-tree-item]");
          }
        });
      }
      const count = document.querySelector("[data-tree-filter-count]");
      const empty = treeScroll.querySelector("[data-tree-filter-empty]");
      const suffix = count?.dataset.treeSuffix || "";
      if (count) {
        const suffixText = suffix ? suffix + " " : "";
        count.textContent = !query && selectedStatuses.size === 0
          ? L("共 {count} 个{suffix}目标", { count: items.length, suffix: suffixText })
          : L("显示 {shown} / {total} 个{suffix}目标", { shown: matched.length, total: items.length, suffix: suffixText });
      }
      if (empty) empty.hidden = matched.length > 0 || items.length === 0;
      updateGraphVisibility();
    }

    const searchInteractionActive = () => searchComposing || Date.now() < searchBusyUntil;

    const liveUiInteractionActive = () => {
      const active = document.activeElement;
      if (active?.closest?.("[data-live-form]")) return true;
      const dirtyVisibleForm = [...document.querySelectorAll('[data-live-form][data-live-dirty="true"]')]
        .some((form) => form.getClientRects().length > 0);
      if (dirtyVisibleForm) return true;
      return active?.matches?.('input, textarea, select, [contenteditable="true"]') && Boolean(
        active.closest?.('[data-directory-panel="feed"], [data-directory-panel="sources"], [data-work-surface="feed"], [data-work-surface="sources"]'),
      );
    };

    document.addEventListener("input", (event) => {
      event.target?.closest?.("[data-live-form]")?.setAttribute("data-live-dirty", "true");
    });
    document.addEventListener("change", (event) => {
      event.target?.closest?.("[data-live-form]")?.setAttribute("data-live-dirty", "true");
    });
    document.addEventListener("reset", (event) => {
      const form = event.target?.closest?.("[data-live-form]");
      if (form) requestAnimationFrame(() => form.removeAttribute("data-live-dirty"));
    });

    const scheduleDeferredRefresh = () => {
      clearTimeout(deferredRefreshTimer);
      const wait = Math.max(80, searchBusyUntil - Date.now() + 40);
      deferredRefreshTimer = setTimeout(() => refreshBoard(), wait);
    };

    const noteSearchActivity = (delay = 900) => {
      searchBusyUntil = Math.max(searchBusyUntil, Date.now() + delay);
      scheduleDeferredRefresh();
    };

    const refreshBoard = async (force = false) => {
      if (syncing || document.hidden) return;
      if (!force && searchInteractionActive()) {
        scheduleDeferredRefresh();
        return;
      }
      if (!force && liveUiInteractionActive()) {
        return;
      }
      syncing = true;
      try {
        const cursorResponse = await fetch(route("/api/board/cursor"), { cache: "no-store" });
        if (!cursorResponse.ok) throw new Error("无法读取 GoalBoard 游标");
        const cursorState = await cursorResponse.json();
        if (Number(cursorState.observed_event_cursor) === Number(state.snapshot.cursor)) {
          return;
        }
        if (!force && searchInteractionActive()) {
          scheduleDeferredRefresh();
          return;
        }
        if (!force && liveUiInteractionActive()) return;
        const refreshGoalId = selected;
        const pageBase = goalPageBase();
        const collectionPath = trashView ? "/trash" : archiveView ? "/archive" : "/";
        const pagePath = decisionView
          ? route("/decisions")
          : refreshGoalId
            ? pageBase + encodeURIComponent(refreshGoalId)
            : route(collectionPath);
        const compactRefreshPath = route("/api/board/refresh?view=" + documentCollection +
          (refreshGoalId ? "&goal_id=" + encodeURIComponent(refreshGoalId) : ""));
        let pageResponse = await fetch(decisionView ? pagePath : compactRefreshPath, { cache: "no-store" });
        if (!pageResponse.ok && !decisionView) {
          pageResponse = await fetch(pagePath, { cache: "no-store" });
        }
        if (!pageResponse.ok && !decisionView) {
          pageResponse = await fetch(route(collectionPath), { cache: "no-store" });
        }
        if (!pageResponse.ok) throw new Error("无法更新 Goal 页面");
        const parsed = new DOMParser().parseFromString(await pageResponse.text(), "text/html");
        if (parsed.body.dataset.boardView !== document.body.dataset.boardView) {
          location.reload();
          return;
        }
        const nextStateNode = parsed.querySelector("#goalboard-data");
        if (!nextStateNode) throw new Error("页面状态不完整");
        const nextState = JSON.parse(nextStateNode.textContent);
        if (decisionView) {
          const nextFeedList = parsed.querySelector("[data-feed-list]");
          const nextFeedWorkbench = parsed.querySelector("[data-feed-workbench]");
          const nextFeedDetailEmpty = nextFeedWorkbench?.querySelector("[data-feed-detail-empty]");
          if (!feedList || !feedWorkbench || !feedEmpty || !feedDetailEmpty || !nextFeedList || !nextFeedWorkbench || !nextFeedDetailEmpty) {
            throw new Error("待决定页面数据不完整");
          }
          const scrollTop = window.scrollY;
          const nextRows = [...nextFeedList.querySelectorAll("[data-feed-entry-id]")];
          feedList.querySelectorAll("[data-feed-entry-id]").forEach((row) => row.remove());
          nextRows.forEach((row) => feedList.insertBefore(row, feedEmpty));
          feedWorkbench.querySelectorAll("[data-feed-detail]").forEach((detail) => detail.remove());
          [...nextFeedWorkbench.querySelectorAll("[data-feed-detail]")]
            .forEach((detail) => feedWorkbench.insertBefore(detail, feedDetailEmpty));
          feedDetailEmpty.innerHTML = nextFeedDetailEmpty.innerHTML;
          feedDetailEmpty.hidden = nextFeedDetailEmpty.hidden;
          feedWorkbench.dataset.loaded = nextFeedWorkbench.dataset.loaded || "true";
          feedWorkbench.dataset.loadedPreset = nextFeedWorkbench.dataset.loadedPreset || "inbox_message";
          state = nextState;
          document.querySelector("#goalboard-data").textContent = JSON.stringify(nextState).replaceAll("<", "\\u003c");
          const deepLinkedEntry = decisionFeedEntryFromHash();
          if (deepLinkedEntry && !nextRows.some((row) => row.dataset.feedEntryId === deepLinkedEntry)) {
            history.replaceState(null, "", location.pathname + location.search);
          }
          selectedFeedItem = nextRows.find((row) => row.classList.contains("is-selected"))?.dataset.feedEntryId || "";
          filterFeedItems(false);
          window.scrollTo({ top: scrollTop, behavior: "instant" });
          return;
        }
        const nextGoals = visibleGoals(nextState);
        const renderedGoalId = parsed.querySelector("[data-goal-view]")?.dataset.goalView || "";
        const goalStillExists = nextGoals.some((item) => item.goal.goal_id === refreshGoalId);
        const nextSelected = decisionView
          ? ""
          : renderedGoalId || (goalStillExists ? selected : nextState.active_goal_id || nextGoals[0]?.goal.goal_id || "");
        const nextTree = parsed.querySelector("[data-tree-scroll]");
        const nextDocument = parsed.querySelector("[data-document-pane]");
        const nextFooter = parsed.querySelector("[data-tree-footer]");
        const nextFilter = parsed.querySelector("[data-tree-filter]");
        const nextCount = parsed.querySelector("[data-tree-count]");
        const nextDialog = parsed.querySelector("[data-create-dialog]");
        const nextDecisionsLink = parsed.querySelector("[data-decisions-link]");
        const nextArchiveLink = parsed.querySelector("[data-archive-link]");
        const nextTrashLink = parsed.querySelector("[data-trash-link]");
        if (!nextTree || !nextDocument || !nextFooter) throw new Error("页面数据不完整");
        if (!force && searchInteractionActive()) {
          scheduleDeferredRefresh();
          return;
        }
        if (!decisionView && selected !== refreshGoalId) {
          scheduleDeferredRefresh();
          return;
        }
        if (refreshGoalId && !goalStillExists) {
          const movedToCurrent = nextState.goals.some((item) => item.goal.goal_id === refreshGoalId);
          const movedToArchive = nextState.archived_goals.some((item) => item.goal.goal_id === refreshGoalId);
          const movedToTrash = nextState.trashed_goals.some((item) => item.goal.goal_id === refreshGoalId);
          const movedPath = movedToCurrent
            ? "/goals/" + encodeURIComponent(refreshGoalId)
            : movedToArchive
              ? "/archive/goals/" + encodeURIComponent(refreshGoalId)
              : movedToTrash
                ? "/trash/goals/" + encodeURIComponent(refreshGoalId)
                : collectionPath;
          const message = movedToCurrent
            ? L("这条 Goal 已恢复到当前 Goal，已继续打开同一条 Goal。")
            : movedToArchive
              ? L("这条 Goal 已归档，已继续打开归档中的同一条 Goal。")
              : movedToTrash
                ? L("这条 Goal 已移入回收站，已继续打开同一条 Goal。")
                : L("这条 Goal 已不在当前集合，已返回列表。");
          try {
            sessionStorage.setItem(goalMoveReceiptKey, JSON.stringify({ goalId: refreshGoalId, message }));
          } catch {}
          saveUiState();
          location.replace(globalThis.goalboardNavigationUrl(route(movedPath)));
          return "reloading";
        }
        if (!force && liveUiInteractionActive()) return;
        const ui = readUiState();
        const createDraft = dialog.open ? readCreateDraft() : null;
        documentPane.classList.add("is-syncing");
        treeScroll.innerHTML = nextTree.innerHTML;
        const currentPrimarySurface = documentPane.querySelector('[data-work-surface="' + (decisionView ? "inbox" : "goal") + '"]');
        const nextPrimarySurface = nextDocument.querySelector('[data-work-surface="' + (decisionView ? "inbox" : "goal") + '"]');
        if (currentPrimarySurface && nextPrimarySurface) {
          currentPrimarySurface.replaceChildren(...nextPrimarySurface.childNodes);
        } else {
          documentPane.replaceChildren(...nextDocument.childNodes);
        }
        if (nextFilter && treeFilter) treeFilter.innerHTML = nextFilter.innerHTML;
        document.querySelector("[data-tree-footer]").innerHTML = nextFooter.innerHTML;
        if (nextCount) document.querySelector("[data-tree-count]").textContent = nextCount.textContent;
        const replaceNavLink = (current, next) => {
          if (!current || !next) return;
          current.innerHTML = next.innerHTML;
          current.className = next.className;
          for (const name of ["href", "aria-label", "aria-current", "title"]) {
            const value = next.getAttribute(name);
            if (value == null) current.removeAttribute(name);
            else current.setAttribute(name, value);
          }
        };
        replaceNavLink(document.querySelector("[data-decisions-link]"), nextDecisionsLink);
        replaceNavLink(document.querySelector("[data-archive-link]"), nextArchiveLink);
        replaceNavLink(document.querySelector("[data-trash-link]"), nextTrashLink);
        if (nextDialog) {
          form.elements.parent_goal_id.innerHTML = nextDialog.querySelector('[name="parent_goal_id"]').innerHTML;
          form.querySelector(".goal-choice-list").innerHTML = nextDialog.querySelector(".goal-choice-list").innerHTML;
          applyCreateDraft(createDraft);
        }
        state = nextState;
        document.querySelector("#goalboard-data").textContent = JSON.stringify(nextState).replaceAll("<", "\\u003c");
        selected = nextSelected;
        if (selected) ensureWorkTab(selected);
        if (!decisionView && selected) applySelection(selected, false);
        applyUiState(ui);
        updateAllRelationFormPreviews();
        const refreshedGraph = graphElement();
        if (refreshedGraph?.dataset.loaded === "true") {
          if (workspace.dataset.workspaceMode === "graph") void loadGoalGraph(true);
          else refreshedGraph.dataset.loaded = "false";
        }
        requestAnimationFrame(() => documentPane.classList.remove("is-syncing"));
      } catch {
      } finally {
        syncing = false;
      }
    };

    const decisionReceiptContext = (decisionForm) => {
      const ownerLink = decisionForm.closest(".decision-goal-group")?.querySelector("a.decision-owner-link");
      return {
        goalTitle: ownerLink?.querySelector("strong")?.textContent?.trim() || "",
        goalHref: ownerLink?.getAttribute("href") || "",
      };
    };

    const showDecisionReceipt = (message, context) => {
      const center = document.querySelector("[data-decision-center]");
      const activeFeedDetail = feedWorkbench?.querySelector('[data-feed-detail]:not([hidden])');
      const receiptHost = center || activeFeedDetail;
      if (!receiptHost) {
        showToast(message);
        return;
      }
      receiptHost.querySelector("[data-decision-receipt]")?.remove();
      const receipt = document.createElement("aside");
      receipt.className = "decision-receipt";
      receipt.dataset.decisionReceipt = "true";
      receipt.setAttribute("role", "status");
      receipt.setAttribute("tabindex", "-1");
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = L("已记录你的决定");
      const detail = document.createElement("span");
      detail.textContent = message + " " + (receiptHost.querySelector(".decision-record") ? L("下一步：继续处理下面的待决定事项。") : L("下一步：返回 Goal 查看结果。"));
      copy.append(title, detail);
      receipt.append(copy);
      if (context?.goalHref) {
        const link = document.createElement("a");
        link.href = context.goalHref;
        link.textContent = context.goalTitle ? L("返回「{title}」", { title: context.goalTitle }) : L("返回 Goal");
        receipt.append(link);
      }
      const receiptAnchor = receiptHost.querySelector(".decision-center-header, .feed-detail-header");
      if (receiptAnchor) receiptAnchor.after(receipt);
      else receiptHost.prepend(receipt);
      receipt.focus({ preventScroll: true });
    };

    const refreshBoardWithDecisionReceipt = async (message, context) => {
      try {
        sessionStorage.setItem("goalboard-decision-receipt", JSON.stringify({ message, context }));
      } catch {}
      const refreshResult = await refreshBoard(true);
      if (refreshResult === "reloading") return;
      try {
        sessionStorage.removeItem("goalboard-decision-receipt");
      } catch {}
      showDecisionReceipt(message, context);
    };

    const showFactorReceipt = (factor, titleText, detailText) => {
      setGoalPanel("factors", false);
      setGoalFactor(factor, false, true);
      documentPane.querySelector("[data-factor-write-receipt]")?.remove();
      const panel = documentPane.querySelector('[data-goal-factor-panel="' + factor + '"]');
      if (!panel) {
        showToast(titleText);
        return;
      }
      const receipt = document.createElement("aside");
      receipt.className = "factor-write-receipt";
      receipt.dataset.factorWriteReceipt = "true";
      receipt.setAttribute("role", "status");
      receipt.setAttribute("tabindex", "-1");
      const title = document.createElement("strong");
      title.textContent = titleText;
      const detail = document.createElement("span");
      detail.textContent = detailText;
      receipt.append(title, detail);
      const panelContent = panel.querySelector(":scope > .focus-section-card-content") || panel;
      panelContent.querySelector(":scope > header")?.after(receipt);
      receipt.focus({ preventScroll: true });
    };

    const requireDecisionText = (decisionForm, errorBox, fieldName, message) => {
      const field = decisionForm.querySelector('[name="' + fieldName + '"]');
      if (String(field?.value || "").trim()) {
        field?.removeAttribute("aria-invalid");
        return false;
      }
      errorBox.textContent = L(message);
      errorBox.hidden = false;
      field?.setAttribute("aria-invalid", "true");
      field?.focus();
      const clearError = () => {
        if (!String(field?.value || "").trim()) return;
        field.removeAttribute("aria-invalid");
        errorBox.hidden = true;
        field.removeEventListener("input", clearError);
        field.removeEventListener("change", clearError);
      };
      field?.addEventListener("input", clearError);
      field?.addEventListener("change", clearError);
      return true;
    };

    const humanDecisionError = (message, fallback) => String(message || fallback)
      .replaceAll("Contract Proposal", "目标说明")
      .replaceAll("Contract", "目标说明")
      .replaceAll("Candidate Goal", "新发现的工作")
      .replaceAll("Candidate", "新发现的工作")
      .replaceAll("Goal Spine", "Goal Tree")
      .replaceAll("Rewire", "Goal 关系调整")
      .replaceAll("Review", "结果确认")
      .replaceAll("Risk", "风险")
      .replaceAll("Impact", "影响范围")
      .replaceAll("Policy", "工作规则")
      .replaceAll("Runtime", "执行工具");

    const submitDecisionForm = async (decisionForm, submitter, endpoint, decision, successMessage) => {
      const buttons = [...decisionForm.querySelectorAll('button[type="submit"]')];
      const errorBox = decisionForm.querySelector("[data-decision-error]");
      const reason = String(new FormData(decisionForm).get("reason") || "").trim();
      const receiptContext = decisionReceiptContext(decisionForm);
      if (requireDecisionText(decisionForm, errorBox, "reason", "请填写决定理由或修改意见")) return;
      const buttonStates = buttons.map((button) => button.disabled);
      const submitLabel = submitter?.textContent;
      buttons.forEach((button) => { button.disabled = true; });
      if (submitter) submitter.textContent = L("正在保存…");
      errorBox.hidden = true;
      try {
        const response = await fetch(route(endpoint), {
          method: "POST",
          headers: goalboardControlHeaders(),
          body: JSON.stringify({ decision, reason }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "决定提交失败");
        await refreshBoardWithDecisionReceipt(
          typeof successMessage === "function" ? successMessage(result) : successMessage,
          receiptContext,
        );
      } catch (error) {
        errorBox.textContent = humanDecisionError(error.message, "决定提交失败，请检查输入后重试");
        errorBox.hidden = false;
        buttons.forEach((button, index) => { button.disabled = buttonStates[index]; });
        if (submitter) submitter.textContent = submitLabel;
      }
    };

    treeSearch?.addEventListener("input", () => {
      noteSearchActivity();
      filterTree(treeSearch.value);
      queueSave();
    });
    treeSearch?.addEventListener("focus", () => noteSearchActivity(500));
    treeSearch?.addEventListener("keydown", () => noteSearchActivity());
    treeSearch?.addEventListener("compositionstart", () => {
      searchComposing = true;
      noteSearchActivity();
    });
    treeSearch?.addEventListener("compositionend", () => {
      searchComposing = false;
      noteSearchActivity(500);
    });
    treeScroll.addEventListener("keydown", (event) => {
      if (event.target !== treeScroll) return;
      const page = Math.max(38, treeScroll.clientHeight - 38);
      const next = {
        ArrowDown: treeScroll.scrollTop + 38,
        ArrowUp: treeScroll.scrollTop - 38,
        PageDown: treeScroll.scrollTop + page,
        PageUp: treeScroll.scrollTop - page,
        Home: 0,
        End: treeScroll.scrollHeight,
      }[event.key];
      if (next == null) return;
      event.preventDefault();
      treeScroll.scrollTop = next;
      queueSave();
    });
    treeScroll.addEventListener("scroll", queueSave, { passive: true });
    documentPane.addEventListener("scroll", queueSave, { passive: true });
    document.addEventListener("toggle", (event) => {
      if (event.target.matches?.("[data-persist-open]")) queueSave();
    }, true);
    document.addEventListener("change", (event) => {
      const changed = event.target instanceof Element ? event.target : null;
      if (!changed) return;
      const changedFactorForm = changed.closest("[data-relation-form], [data-risk-create-form], [data-risk-edit-form], [data-impact-create-form], [data-impact-edit-form], [data-policy-form]");
      if (changedFactorForm) {
`;

