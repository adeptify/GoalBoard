/** AP3 Workbench client segment: editing-graph. */
export const CLIENT_EDITING_GRAPH_SCRIPT = `
    const updateRelationPreviews = () => {
      if (!form) return;
      const parent = form.elements.parent_goal_id?.selectedOptions?.[0];
      const parentPreview = form.querySelector("[data-parent-preview]");
      if (parentPreview) {
        parentPreview.textContent = parent?.value
          ? "关系预览：新 Goal → 属于 → 「" + (parent.dataset.goalName || parent.textContent) + "」。这是目录层级，不需要等待它完成。"
          : "关系预览：新 Goal 将作为独立 Goal 出现在 Tree 中。";
      }
      const dependencies = [...form.querySelectorAll('[name="dependency_goal_ids"]:checked')];
      const dependencyPreview = form.querySelector("[data-dependency-preview]");
      if (dependencyPreview) {
        const names = dependencies.map((input) => "「" + (input.dataset.goalName || input.value) + "」");
        dependencyPreview.textContent = names.length
          ? "关系预览：新 Goal → 依赖 → " + names.join(currentLocale() === "en" ? ", " : "、") + "；这些 Goal 完成前不能领取或完成新 Goal。"
          : "关系预览：当前没有执行前置，Goal 可以独立推进。";
      }
    };

    const updateRelationFormPreview = (relationForm) => {
      if (!relationForm) return;
      const intent = relationForm.elements.relation_intent?.value || "other";
      const intentMap = {
        needs: ["outgoing", "depends_on"],
        belongs: ["outgoing", "part_of"],
        enables: ["incoming", "depends_on"],
        contains: ["incoming", "part_of"],
      };
      if (intentMap[intent]) {
        relationForm.elements.direction.value = intentMap[intent][0];
        relationForm.elements.type.value = intentMap[intent][1];
      }
      const preview = relationForm.querySelector("[data-relation-live-preview]");
      const type = relationForm.elements.type?.selectedOptions?.[0];
      const target = relationForm.elements.target_goal_id?.selectedOptions?.[0];
      const direction = relationForm.elements.direction?.value || "outgoing";
      if (!preview || !type || !target) return;
      const currentName = relationForm.dataset.currentGoalName || relationForm.dataset.goalId;
      const targetName = target.dataset.goalName || target.textContent;
      const left = direction === "outgoing" ? currentName : targetName;
      const right = direction === "outgoing" ? targetName : currentName;
      const label = type.dataset.outLabel || type.textContent;
      preview.querySelector("strong").textContent = left + " → " + label + " → " + right;
      preview.querySelector("p").textContent = type.dataset.description || "关系方向和原因会进入事件历史";
    };

    const updateAllRelationFormPreviews = () => {
      document.querySelectorAll("[data-relation-form]").forEach(updateRelationFormPreview);
    };

    const renumberCriteria = (list) => {
      [...list.querySelectorAll("[data-criterion-row]")].forEach((row, index) => {
        const label = row.querySelector("[data-criterion-number]");
        if (label) label.textContent = "验收条件 " + (index + 1);
      });
    };

    const splitLines = (value) => [...new Set(String(value || "")
      .split("\\n")
      .map((item) => item.trim())
      .filter(Boolean))];

    const requireFormFacts = (form, errorBox) => {
      const invalid = [...form.querySelectorAll("[required]")].find((control) => {
        if (control.type === "checkbox" || control.type === "radio") return !control.checked;
        return !String(control.value || "").trim();
      });
      if (!invalid) return false;
      let disclosure = invalid.closest("details");
      while (disclosure) {
        disclosure.open = true;
        disclosure = disclosure.parentElement?.closest("details");
      }
      form.querySelectorAll('[aria-invalid="true"]').forEach((control) => control.removeAttribute("aria-invalid"));
      invalid.setAttribute("aria-invalid", "true");
      const label = invalid.closest("label")?.querySelector(":scope > span")?.textContent?.trim() || L("必填信息");
      errorBox.textContent = L("请先补充：{label}", { label });
      errorBox.hidden = false;
      requestAnimationFrame(() => invalid.focus());
      return true;
    };

    const readRiskPayload = (values) => ({
      goal_ids: values.getAll("goal_ids").map(String),
      description: String(values.get("description") || "").trim(),
      probability: String(values.get("probability") || "").trim(),
      impact: String(values.get("impact") || "").trim(),
      affected_surfaces: splitLines(values.get("affected_surfaces")),
      trigger: String(values.get("trigger") || "").trim(),
      treatment: values.get("treatment"),
      treatment_plan: String(values.get("treatment_plan") || "").trim(),
      blocking_mode: values.get("blocking_mode"),
      revisit_condition: String(values.get("revisit_condition") || "").trim(),
      owner: String(values.get("owner") || "").trim(),
      reason: String(values.get("reason") || "").trim(),
    });

    const readImpactPayload = (values) => ({
      goal_id: String(values.get("goal_id") || "").trim(),
      surface: String(values.get("surface") || "").trim(),
      access: values.get("access"),
      input_snapshot: String(values.get("input_snapshot") || "").trim(),
      state: values.get("state"),
      reason: String(values.get("reason") || "").trim(),
      audit_reason: String(values.get("audit_reason") || "").trim(),
    });

    const riskStateEffect = (blockingMode, riskState) => {
      if (!riskState) return L("选择处理结果后，这里会说明会发生什么。");
      const active = riskState === "open" || riskState === "triggered";
      if (!active) {
        return blockingMode === "invalidate_on_trigger"
          ? L("当前不再使 Goal 失效；若此前触发，关联 Goal 必须重新验证。")
          : L("当前状态不再施加领取或完成门禁。");
      }
      if (blockingMode === "claim") return L("当前会阻止所有关联 Goal 被新的 Runtime 领取。");
      if (blockingMode === "completion") return L("当前会阻止所有关联 Goal 被标记为完成。");
      if (blockingMode === "invalidate_on_trigger") {
        return riskState === "triggered"
          ? L("Risk 已触发，所有关联 Goal 立即失效。")
          : L("Risk 目前开放；一旦标记为已触发，所有关联 Goal 会失效。");
      }
      return L("这是一条持续观察的事实，不直接阻塞领取或完成。");
    };

    const updateRiskStatePreview = (riskForm) => {
      const preview = riskForm?.querySelector("[data-risk-state-preview]");
      const stateSelect = riskForm?.querySelector("[data-risk-state-select]");
      if (preview && stateSelect) {
        const effect = riskStateEffect(riskForm.dataset.riskBlocking, stateSelect.value);
        preview.textContent = stateSelect.value === "open" || stateSelect.value === "triggered"
          ? L("保存后仍会留在待决定中。{effect}", { effect })
          : effect;
      }
      const basis = riskForm?.querySelector("[data-risk-resolution-basis]");
      if (basis && stateSelect) basis.hidden = stateSelect.value !== "resolved";
    };

    const updateRiskGoalCount = (picker) => {
      const count = picker?.querySelectorAll('[name="goal_ids"]:checked').length || 0;
      const summary = picker?.querySelector("summary small");
      if (summary) summary.textContent = count + " 个已选择 · 至少选择一个";
    };

    const parseCriterionTarget = (value) => {
      const text = String(value || "").trim();
      if (!text) return null;
      try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed
          : { value: parsed };
      } catch {
        return { value: text };
      }
    };

    const readCreateDraft = () => {
      if (!form) return null;
      const values = {};
      [...form.elements].forEach((control) => {
        if (!control.name) return;
        if (control.type === "checkbox") {
          values[control.name] ||= [];
          if (control.checked) values[control.name].push(control.value);
          return;
        }
        values[control.name] = control.value;
      });
      const active = document.activeElement;
      return {
        values,
        focus: active && form.contains(active) && active.name
          ? { name: active.name, value: active.value, start: active.selectionStart, end: active.selectionEnd }
          : null,
      };
    };

    const applyCreateDraft = (draft) => {
      if (!form || !draft) return;
      [...form.elements].forEach((control) => {
        if (!control.name || !(control.name in draft.values)) return;
        if (control.type === "checkbox") {
          control.checked = draft.values[control.name].includes(control.value);
          return;
        }
        control.value = draft.values[control.name];
      });
      updateRelationPreviews();
      if (!draft.focus) return;
      const focused = [...form.elements].find((control) =>
        control.name === draft.focus.name &&
        (control.type !== "checkbox" || control.value === draft.focus.value)
      );
      if (!focused) return;
      focused.focus({ preventScroll: true });
      if (typeof focused.setSelectionRange === "function" && draft.focus.start != null) {
        focused.setSelectionRange(draft.focus.start, draft.focus.end);
      }
    };

    const showToast = (message, error = false) => {
      toast.textContent = message;
      toast.classList.toggle("is-error", error);
      toast.classList.add("is-visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
    };

    const goalPageBase = () => route(trashView ? "/trash/goals/" : archiveView ? "/archive/goals/" : "/goals/");
    const goalPageUrl = (goalId) => goalPageBase() + encodeURIComponent(goalId) + (document.body.dataset.nativeDesktop === "true" ? "?desktop=1" : "");

    const openGoalTrashDialog = (trigger, trashed) => {
      if (!trashDialog || !trashForm) return;
      const goalId = String(trigger.dataset.goalId || "").trim();
      const goalTitle = String(trigger.dataset.goalTitle || goalId).trim();
      if (!goalId) return;
      trashIntent = { goalId, goalTitle, trashed };
      trashError.hidden = true;
      trashError.textContent = "";
      trashForm.elements.reason.value = "";
      trashDialog.querySelector("[data-goal-trash-title]").textContent = trashed ? "移入回收站" : "恢复 Goal";
      trashDialog.querySelector("[data-goal-trash-description]").textContent = trashed
        ? "请确认这条 Goal 和本次操作原因。"
        : "请确认把这条 Goal 恢复到日常 Goal Tree。";
      trashDialog.querySelector("[data-goal-trash-target-title]").textContent = goalTitle;
      trashDialog.querySelector("[data-goal-trash-target-id]").textContent = goalId;
      trashDialog.querySelector("[data-goal-trash-note]").textContent = trashed
        ? "该操作可恢复：Goal 历史会保留，当前仍生效的关联关系会暂时停止。若还有有效 Claim 或执行中的 Run，系统不会改动 Goal，而会告诉你先结束哪项工作。"
        : "恢复不会创建新 Goal，也不会自动启动 Runtime。系统只会恢复两端都不在回收站的关联关系；其余关系会保留为待处理事实。";
      trashDialog.querySelector("[data-goal-trash-reason-label]").textContent = trashed ? "移入原因" : "恢复原因";
      trashForm.elements.reason.placeholder = trashed
        ? "说明为什么暂时不再保留这条 Goal"
        : "说明为什么现在要恢复这条 Goal";
      trashSubmit.classList.toggle("button-danger", trashed);
      trashSubmit.classList.toggle("button-primary", !trashed);
      trashSubmit.textContent = trashed ? "移入回收站" : "恢复到 Goal Tree";
      trashDialog.showModal();
      if (!matchMedia("(max-width: 760px)").matches) {
        requestAnimationFrame(() => trashForm.elements.reason.focus());
      }
    };

    const closeGoalTrashDialog = () => {
      if (!trashDialog?.open) return;
      trashDialog.close();
      trashIntent = null;
      refreshBoard();
    };

    const describeTrashBlock = (result) => {
      const claims = Array.isArray(result.blocking_claim_ids) ? result.blocking_claim_ids : [];
      const runs = Array.isArray(result.blocking_run_ids) ? result.blocking_run_ids : [];
      const records = [
        claims.length ? "有效 Claim：" + claims.join(currentLocale() === "en" ? ", " : "、") : "",
        runs.length ? "执行中 Run：" + runs.join(currentLocale() === "en" ? ", " : "、") : "",
      ].filter(Boolean).join("；");
      return "现在无法移入回收站：这条 Goal 仍有正在进行的 Runtime 工作。" +
        (records ? records + "。" : "") +
        "请先结束或释放这些工作，再重新确认。";
    };

    const submitGoalTrashForm = async () => {
      if (!trashIntent || !trashForm || !trashError || !trashSubmit) return;
      const reason = String(new FormData(trashForm).get("reason") || "").trim();
      if (!reason) {
        trashError.textContent = "请说明本次操作原因。";
        trashError.hidden = false;
        trashForm.elements.reason.focus();
        return;
      }
      trashError.hidden = true;
      trashSubmit.disabled = true;
      let redirecting = false;
      try {
        const response = await fetch(route("/api/goals/" + encodeURIComponent(trashIntent.goalId) + "/trash"), {
          method: "POST",
          headers: goalboardControlHeaders(),
          body: JSON.stringify({
            trashed: trashIntent.trashed,
            reason,
            user_confirmed: true,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "操作失败");
        if (result.status === "blocked") {
          trashError.textContent = describeTrashBlock(result);
          trashError.hidden = false;
          return;
        }
        const expected = trashIntent.trashed
          ? ["trashed", "already_trashed"]
          : ["restored", "already_active"];
        if (!expected.includes(result.status)) throw new Error("GoalBoard 返回了无法识别的回收站状态");
        redirecting = true;
        trashDialog.close();
        sessionStorage.removeItem(storageKey);
        location.assign(globalThis.goalboardNavigationUrl(route((trashIntent.trashed ? "/trash/goals/" : "/goals/") + encodeURIComponent(trashIntent.goalId))));
      } catch (error) {
        trashError.textContent = error.message || "操作失败，请检查后重试";
        trashError.hidden = false;
      } finally {
        if (!redirecting) trashSubmit.disabled = false;
      }
    };

    const setMobileView = (view) => {
      workspace.dataset.mobileView = view;
      document.querySelector(".topbar")?.setAttribute("data-mobile-surface", view);
      const directoryRootActive = view === "tree" && treePane?.dataset.desktopDirectory === "root";
      if (mobileDirectoryTab) {
        mobileDirectoryTab.classList.toggle("is-active", directoryRootActive);
        mobileDirectoryTab.setAttribute("aria-selected", String(directoryRootActive));
      }
      document.querySelectorAll("[data-mobile-target]").forEach((button) => {
        const active = button.dataset.mobileTarget === view && !(directoryRootActive && view === "tree");
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
      });
    };

    const graphElement = () => workspace.querySelector("[data-goal-momentum]");

    const drawGoalGraph = () => {
      const graph = graphElement();
      const stage = graph?.querySelector("[data-graph-stage]");
      if (!graph || graph.hidden || !stage) return;
      const scale = Number(stage.dataset.graphScale || "1") || 1;
      const stageRect = stage.getBoundingClientRect();
      const nodeById = new Map(
        [...stage.querySelectorAll("[data-graph-node]")]
          .filter((node) => !node.hidden)
          .map((node) => [node.dataset.goalId, node]),
      );
      [...stage.querySelectorAll("[data-graph-edge]")].filter((edge) => !edge.hasAttribute("hidden")).forEach((edge, visibleEdgeIndex) => {
        const from = nodeById.get(edge.dataset.edgeFrom);
        const to = nodeById.get(edge.dataset.edgeTo);
        const path = edge.querySelector("path");
        if (!from || !to || !path) return;
        const fromRect = from.getBoundingClientRect();
        const toRect = to.getBoundingClientRect();
        const fromX = (fromRect.right - stageRect.left) / scale;
        const fromY = (fromRect.top + fromRect.height / 2 - stageRect.top) / scale;
        const toX = (toRect.left - stageRect.left) / scale;
        const toY = (toRect.top + toRect.height / 2 - stageRect.top) / scale;
        const edgeIndex = Number(edge.dataset.edgeIndex || visibleEdgeIndex) || 0;
        if (toX > fromX + 16) {
          const middleX = fromX + (toX - fromX) * .5 + ((edgeIndex % 3) - 1) * 5;
          path.setAttribute("d", "M " + fromX + " " + fromY + " H " + middleX + " V " + toY + " H " + toX);
        } else {
          const routeY = Math.min(fromY, toY) - 24 - edgeIndex % 4 * 7;
          path.setAttribute("d", "M " + fromX + " " + fromY + " H " + (fromX + 16) + " V " + routeY + " H " + (toX - 16) + " V " + toY + " H " + toX);
        }
      });
    };

    const bindGoalGraphViewport = () => {
      const viewport = graphElement()?.querySelector("[data-graph-viewport]");
      if (!viewport) return;
      if (typeof ResizeObserver === "function" && graphResizeTarget !== viewport) {
        graphResizeObserver?.disconnect();
        graphResizeTarget = viewport;
        graphResizeObserver = new ResizeObserver(() => {
          cancelAnimationFrame(graphResizeFrame);
          graphResizeFrame = requestAnimationFrame(() => graphAutoFit ? fitGoalGraph(false) : drawGoalGraph());
        });
        graphResizeObserver.observe(viewport);
      }
      if (viewport.dataset.panBound === "true") return;
      viewport.dataset.panBound = "true";
      let pointerId = null;
      let pointerX = 0;
      let pointerY = 0;
      let scrollLeft = 0;
      let scrollTop = 0;
      viewport.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.closest("button, a, input, select, textarea")) return;
        pointerId = event.pointerId;
        pointerX = event.clientX;
        pointerY = event.clientY;
        scrollLeft = viewport.scrollLeft;
        scrollTop = viewport.scrollTop;
        viewport.classList.add("is-panning");
        viewport.setPointerCapture(pointerId);
        event.preventDefault();
      });
      viewport.addEventListener("pointermove", (event) => {
        if (pointerId !== event.pointerId || !viewport.hasPointerCapture(pointerId)) return;
        viewport.scrollLeft = scrollLeft - (event.clientX - pointerX);
        viewport.scrollTop = scrollTop - (event.clientY - pointerY);
      });
      const finishPan = (event) => {
        if (pointerId !== event.pointerId) return;
        if (viewport.hasPointerCapture(pointerId)) viewport.releasePointerCapture(pointerId);
        pointerId = null;
        viewport.classList.remove("is-panning");
      };
      viewport.addEventListener("pointerup", finishPan);
      viewport.addEventListener("pointercancel", finishPan);
    };

    const updateMomentumSelection = (goalId, persist = true) => {
      const graph = graphElement();
      if (!graph?.querySelector('[data-momentum-node][data-goal-id="' + CSS.escape(goalId || "") + '"]')) return;
      momentumSelected = goalId;
      const relatedGoalIds = new Set([goalId]);
      const defaultMarker = graph.querySelector("#momentum-arrow");
      if (defaultMarker && !graph.querySelector("#momentum-arrow-selected")) {
        const selectedMarker = defaultMarker.cloneNode(true);
        selectedMarker.id = "momentum-arrow-selected";
        defaultMarker.after(selectedMarker);
      }
      graph.querySelectorAll("[data-graph-edge]").forEach((edge) => {
        const related = edge.dataset.edgeFrom === goalId || edge.dataset.edgeTo === goalId;
        edge.classList.toggle("is-selected-path", related);
        edge.querySelector("path")?.setAttribute(
          "marker-end",
          related ? "url(#momentum-arrow-selected)" : "url(#momentum-arrow)",
        );
        if (related && edge.dataset.edgeFrom) relatedGoalIds.add(edge.dataset.edgeFrom);
        if (related && edge.dataset.edgeTo) relatedGoalIds.add(edge.dataset.edgeTo);
      });
      graph.querySelectorAll("[data-momentum-node]").forEach((node) => {
        const active = node.dataset.goalId === goalId;
        node.classList.toggle("is-selected", active);
        node.classList.toggle("is-connected-path", !active && relatedGoalIds.has(node.dataset.goalId));
        node.setAttribute("aria-pressed", String(active));
      });
      graph.querySelectorAll("[data-momentum-select]").forEach((button) => {
        const active = button.dataset.momentumSelect === goalId;
        button.classList.toggle("is-selected", active);
        if (button.matches(".momentum-queue-item")) button.setAttribute("aria-pressed", String(active));
      });
      graph.querySelectorAll("[data-momentum-detail]").forEach((detail) => {
        detail.hidden = detail.dataset.momentumDetail !== goalId;
      });
      requestAnimationFrame(drawGoalGraph);
      if (persist) queueSave();
    };

    const updateGraphVisibility = () => {
      const graph = graphElement();
      if (!graph) return;
      graph.dataset.filter = momentumOpenOnly ? "open" : "all";
      const query = String(treeSearch.value || "").trim().toLowerCase();
      const visibleNodeIds = new Set();
      graph.querySelectorAll("[data-graph-node]").forEach((node) => {
        const matchesQuery = !query || String(node.dataset.goalSearch || "").includes(query);
        const matchesStatus = selectedStatuses.size === 0 || selectedStatuses.has(node.dataset.goalStatus);
        const matchesCompletion = !momentumOpenOnly || node.dataset.goalCompleted !== "true";
        node.hidden = !(matchesQuery && matchesStatus && matchesCompletion);
        if (!node.hidden) visibleNodeIds.add(node.dataset.goalId);
      });
      graph.querySelectorAll("[data-graph-edge]").forEach((edge) => {
        const hidden = !visibleNodeIds.has(edge.dataset.edgeFrom) ||
          !visibleNodeIds.has(edge.dataset.edgeTo);
        edge.toggleAttribute("hidden", hidden);
      });
      graph.querySelectorAll("[data-momentum-group]").forEach((group) => {
        const hasVisibleNode = [...graph.querySelectorAll("[data-momentum-node]")]
          .some((node) => !node.hidden && node.dataset.momentumGroupId === group.dataset.momentumGroup);
        group.toggleAttribute("hidden", !hasVisibleNode);
      });
      graph.querySelectorAll("[data-momentum-filter]").forEach((button) => {
        const active = button.dataset.momentumFilter === (momentumOpenOnly ? "open" : "all");
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      updateMomentumSelection(momentumSelected || selected, false);
      requestAnimationFrame(() => graphAutoFit ? fitGoalGraph(false) : drawGoalGraph());
    };

    const setMomentumPeriod = (value, persist = true) => {
      const graph = graphElement();
      momentumPeriod = Number(value) === 30 ? 30 : 7;
      graph?.querySelectorAll("[data-momentum-period]").forEach((button) => {
        const active = Number(button.dataset.momentumPeriod) === momentumPeriod;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      graph?.querySelectorAll("[data-momentum-period-panel]").forEach((panel) => {
        panel.hidden = Number(panel.dataset.momentumPeriodPanel) !== momentumPeriod;
      });
      if (persist) queueSave();
    };

    const setGraphZoom = (value, persist = true, autoFit = false) => {
      const graph = graphElement();
      const stage = graph?.querySelector("[data-graph-stage]");
      graphAutoFit = autoFit;
      graphZoom = Math.min(1.25, Math.max(.55, Math.round((Number(value) || 1) * 100) / 100));
      if (stage) {
        stage.dataset.graphScale = String(graphZoom);
        stage.style.zoom = String(graphZoom);
      }
      const output = graph?.querySelector("[data-graph-zoom-value]");
      if (output) output.textContent = Math.round(graphZoom * 100) + "%";
      graph?.querySelector('[data-graph-zoom="out"]')?.toggleAttribute("disabled", graphZoom <= .55);
      graph?.querySelector('[data-graph-zoom="in"]')?.toggleAttribute("disabled", graphZoom >= 1.25);
      requestAnimationFrame(drawGoalGraph);
      if (persist) queueSave();
    };

    const fitGoalGraph = (persist = true) => {
      const graph = graphElement();
      const viewport = graph?.querySelector("[data-graph-viewport]");
      const stage = graph?.querySelector("[data-graph-stage]");
      if (!viewport || !stage) return;
      const availableWidth = Math.max(1, viewport.clientWidth - 24);
      const scale = Math.min(1, availableWidth / stage.offsetWidth);
      setGraphZoom(scale, persist, true);
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    };

    const loadGoalGraph = async (force = false) => {
      const graph = graphElement();
      if (!graph || (!force && graph.dataset.loaded === "true")) return true;
      if (goalGraphRequest) return goalGraphRequest;
      const status = graph.querySelector("[data-goal-momentum-status]");
      const retry = graph.querySelector("[data-retry-goal-momentum]");
      if (status) status.textContent = L("正在载入推进态势…");
      if (retry) retry.hidden = true;
      graph.setAttribute("aria-busy", "true");
      goalGraphRequest = (async () => {
        try {
          const response = await fetch(
            route("/api/board/momentum?view=" + documentCollection + "&goal_id=" + encodeURIComponent(momentumSelected || selected || "")),
            { cache: "no-store" },
          );
          if (!response.ok) throw new Error(L("无法载入推进态势"));
          const template = document.createElement("template");
          template.innerHTML = (await response.text()).trim();
          const nextGraph = template.content.querySelector("[data-goal-momentum]");
          if (!nextGraph) throw new Error(L("推进态势响应不完整"));
          nextGraph.dataset.loaded = "true";
          graph.replaceWith(nextGraph);
          setWorkspaceMode("graph", false);
          bindGoalGraphViewport();
          if (graphAutoFit) requestAnimationFrame(() => fitGoalGraph(false));
          else setGraphZoom(graphZoom, false, false);
          setMomentumPeriod(momentumPeriod, false);
          updateGraphVisibility();
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : L("无法载入推进态势");
          if (status) status.textContent = message;
          if (retry) retry.hidden = false;
          return false;
        } finally {
          graph.removeAttribute("aria-busy");
          goalGraphRequest = null;
        }
      })();
      return goalGraphRequest;
    };

    const setWorkspaceMode = (view, persist = true) => {
      const graph = graphElement();
      const nextMode = view === "graph" && graph
        ? "graph"
        : view === "runtime" && tuiPane
          ? "runtime"
          : "focus";
      navigatorView = nextMode === "graph" ? "graph" : "list";
      treePane.dataset.navigatorView = navigatorView;
      workspace.dataset.navigatorView = navigatorView;
      workspace.dataset.workspaceMode = nextMode;
      workspace.classList.toggle("is-graph-view", nextMode === "graph");
      documentPane.hidden = nextMode !== "focus";
      if (tuiPane) tuiPane.hidden = nextMode !== "runtime";
      document.querySelectorAll("button[data-navigator-view]").forEach((button) => {
        const active = button.dataset.navigatorView === navigatorView;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
      });
      document.querySelectorAll("button[data-workbench-view]").forEach((button) => {
        const active = button.dataset.workbenchView === nextMode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
        button.setAttribute("tabindex", active ? "0" : "-1");
      });
      if (graph) graph.hidden = nextMode !== "graph";
      if (nextMode === "graph") {
        if (graph?.dataset.loaded === "true") updateGraphVisibility();
        else void loadGoalGraph();
      }
      if (matchMedia("(max-width: 760px)").matches) setMobileView(nextMode === "runtime" ? "tui" : "document");
      if (persist) queueSave();
    };

    const setNavigatorView = (view, persist = true) => {
      setWorkspaceMode(view === "graph" ? "graph" : "focus", persist);
    };

    const goalPanelFromTargetId = (targetId) => {
      if (!targetId) return "";
      const target = document.getElementById(targetId);
`;

