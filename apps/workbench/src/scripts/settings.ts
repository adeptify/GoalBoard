export const SETTINGS_CLIENT_SCRIPT = `
  (() => {
    const dialog = document.querySelector("[data-runtime-plan-dialog]");
    if (!dialog) return;
    const title = dialog.querySelector("[data-runtime-plan-title]");
    const message = dialog.querySelector("[data-runtime-plan-message]");
    const changes = dialog.querySelector("[data-runtime-change-list]");
    const backup = dialog.querySelector("[data-runtime-plan-backup]");
    const restart = dialog.querySelector("[data-runtime-plan-restart]");
    const confirmRow = dialog.querySelector("[data-runtime-confirm-row]");
    const confirmInput = dialog.querySelector("[data-runtime-confirm]");
    const confirmLabel = dialog.querySelector("[data-runtime-confirm-label]");
    const applyButton = dialog.querySelector("[data-runtime-plan-apply]");
    const errorBox = dialog.querySelector("[data-runtime-plan-error]");
    const toast = document.querySelector("[data-settings-toast]");
    let activePlan = null;
    let reloadOnClose = false;
    const showToast = (text) => {
      if (!toast) return;
      toast.textContent = text;
      toast.classList.add("is-visible");
      setTimeout(() => toast.classList.remove("is-visible"), 2600);
    };
    const closeDialog = () => {
      dialog.close();
      if (reloadOnClose) location.reload();
    };
    dialog.querySelectorAll("[data-runtime-plan-close]").forEach((button) => button.addEventListener("click", closeDialog));
    confirmInput?.addEventListener("change", () => {
      applyButton.disabled = !confirmInput.checked || !activePlan || activePlan.status !== "ready";
    });
    document.querySelectorAll("[data-runtime-plan]").forEach((button) => {
      button.addEventListener("click", async () => {
        const runtimeId = button.dataset.runtimePlan;
        const action = button.dataset.runtimeAction;
        activePlan = null;
        reloadOnClose = false;
        title.textContent = L("正在准备接入预览");
        message.textContent = L("GoalBoard 正在只读检查当前 Runtime 配置。");
        changes.innerHTML = "";
        backup.textContent = L("检查中");
        restart.textContent = L("检查中");
        confirmRow.hidden = true;
        confirmInput.checked = false;
        applyButton.disabled = true;
        applyButton.hidden = false;
        applyButton.textContent = L("确认应用");
        errorBox.hidden = true;
        dialog.showModal();
        try {
          const response = await fetch("/api/settings/runtimes/" + encodeURIComponent(runtimeId) + "/plan", {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({ action }),
          });
          const plan = await response.json();
          if (!response.ok) throw new Error(plan.error || L("无法生成 Runtime 接入预览"));
          activePlan = plan;
          title.textContent = plan.display_name + (plan.action === "remove" ? L(" · 移除预览") : L(" · 接入预览"));
          message.textContent = plan.message;
          changes.innerHTML = (plan.changes || []).map((change) => "<li><strong>" + escapeText(change.operation === "remove" ? L("移除") : change.operation === "replace" ? L("替换") : L("新增")) + "</strong><div><p>" + escapeText(change.target_path) + "</p><small>" + escapeText(change.before) + " → " + escapeText(change.after) + "</small></div></li>").join("") || L("<li><strong>无变更</strong><div><p>当前状态无需写入。</p></div></li>");
          backup.textContent = plan.backup_path || L("当前变更无须备份");
          restart.textContent = (plan.restart_instructions || []).join(" ") || L("无须重启");
          confirmRow.hidden = plan.status !== "ready";
          confirmLabel.textContent = plan.confirmation;
          applyButton.hidden = plan.status !== "ready";
        } catch (error) {
          errorBox.textContent = error.message || L("无法生成 Runtime 接入预览");
          errorBox.hidden = false;
          message.textContent = L("没有修改任何配置。");
        }
      });
    });
    applyButton?.addEventListener("click", async () => {
      if (!activePlan || !confirmInput.checked) return;
      applyButton.disabled = true;
      applyButton.textContent = L("正在验证…");
      errorBox.hidden = true;
      try {
        const response = await fetch("/api/settings/runtimes/" + encodeURIComponent(activePlan.runtime_id) + "/confirm", {
          method: "POST",
          headers: goalboardControlHeaders(),
          body: JSON.stringify({ plan_id: activePlan.plan_id, decision: "confirmed" }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || result.error || L("Runtime 接入未完成"));
        message.textContent = result.message;
        changes.innerHTML = L("<li><strong>完成</strong><div><p>") + escapeText(result.message) + "</p></div></li>";
        confirmRow.hidden = true;
        applyButton.hidden = true;
        reloadOnClose = true;
        showToast(result.message);
      } catch (error) {
        errorBox.textContent = error.message || L("Runtime 接入未完成");
        errorBox.hidden = false;
        applyButton.disabled = false;
        applyButton.textContent = L("重新确认");
      }
    });
    const createForm = document.querySelector("[data-project-create]");
    createForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = new FormData(createForm);
      const error = createForm.querySelector(".settings-form-error");
      if (values.get("user_confirmed") !== "on") {
        error.textContent = L("请先确认创建这个项目。");
        error.hidden = false;
        return;
      }
      const submit = createForm.querySelector("button[type=submit]");
      submit.disabled = true;
      error.hidden = true;
      try {
        const response = await fetch("/api/settings/projects", { method: "POST", headers: goalboardControlHeaders(), body: JSON.stringify({ display_name: String(values.get("display_name") || "").trim(), user_confirmed: true }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || L("项目创建失败"));
        location.assign(globalThis.goalboardNavigationUrl(result.project_path));
      } catch (caught) {
        error.textContent = caught.message || L("项目创建失败");
        error.hidden = false;
        submit.disabled = false;
      }
    });
    document.querySelectorAll("[data-project-rename]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = new FormData(form);
        const error = form.querySelector(".settings-form-error");
        const submit = form.querySelector("button[type=submit]");
        submit.disabled = true;
        error.hidden = true;
        try {
          const response = await fetch("/api/settings/projects/" + encodeURIComponent(form.dataset.projectRename) + "/rename", { method: "POST", headers: goalboardControlHeaders(), body: JSON.stringify({ display_name: String(values.get("display_name") || "").trim() }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("项目改名失败"));
          showToast(L("项目已改名为“") + result.project.display_name + "”");
          setTimeout(() => location.reload(), 450);
        } catch (caught) {
          error.textContent = caught.message || L("项目改名失败");
          error.hidden = false;
          submit.disabled = false;
        }
      });
    });
    document.querySelectorAll("[data-demo-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.dataset.demoAction;
        const error = button.closest("section, details")?.querySelector("[data-demo-error]") || document.querySelector("[data-demo-error]");
        const message = action === "create"
          ? L("创建一份明确标记为可重建数据的示例项目？")
          : action === "reset"
            ? L("重建 demo 会清除其中的所有改动，但不会影响用户项目。确认继续？")
            : L("删除这个可重建 demo？用户项目不会被删除。");
        if (!window.confirm(message)) return;
        button.disabled = true;
        if (error) error.hidden = true;
        try {
          const response = await fetch("/api/settings/demo", { method: "POST", headers: goalboardControlHeaders(), body: JSON.stringify({ action, user_confirmed: true }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("demo 操作失败"));
          showToast(result.message || L("demo 已更新"));
          setTimeout(() => location.reload(), 450);
        } catch (caught) {
          if (error) { error.textContent = caught.message || L("demo 操作失败"); error.hidden = false; }
          button.disabled = false;
        }
      });
    });
    document.querySelectorAll("[data-web-service-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const error = document.querySelector("[data-web-service-error]");
        button.disabled = true;
        if (error) error.hidden = true;
        try {
          const previewResponse = await fetch("/api/settings/web-service/plan", { method: "POST", headers: goalboardControlHeaders(), body: JSON.stringify({ action: button.dataset.webServiceAction }) });
          const plan = await previewResponse.json();
          if (!previewResponse.ok) throw new Error(plan.error || L("无法生成常驻服务预览"));
          if (plan.status === "no_change") {
            showToast(plan.message);
            button.disabled = false;
            return;
          }
          if (plan.status !== "ready") throw new Error(plan.message || L("当前不能执行这项常驻服务操作"));
          const changes = (plan.changes || []).map((change) => "• " + change.operation + "：" + change.target).join("\\n");
          if (!window.confirm(plan.message + "\\n\\n" + changes + "\\n\\n" + plan.confirmation)) {
            await fetch("/api/settings/web-service/confirm", { method: "POST", headers: goalboardControlHeaders(), body: JSON.stringify({ plan_id: plan.plan_id, decision: "declined" }) });
            button.disabled = false;
            return;
          }
          const confirmResponse = await fetch("/api/settings/web-service/confirm", { method: "POST", headers: goalboardControlHeaders(), body: JSON.stringify({ plan_id: plan.plan_id, decision: "confirmed" }) });
          const result = await confirmResponse.json();
          if (!confirmResponse.ok) throw new Error(result.error || L("常驻服务操作失败"));
          showToast(result.message);
          setTimeout(() => location.reload(), 450);
        } catch (caught) {
          if (error) {
            error.textContent = caught.message || L("常驻服务操作失败");
            error.hidden = false;
          }
          button.disabled = false;
        }
      });
    });
    function escapeText(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => {
        if (character === "&") return "&amp;";
        if (character === "<") return "&lt;";
        if (character === ">") return "&gt;";
        if (character === '"') return "&quot;";
        return "&#039;";
      });
    }
  })();
`;

export const PROJECT_RULES_CLIENT_SCRIPT = `
  (() => {
    const form = document.querySelector("[data-policy-form]");
    if (!form) return;
    const routePrefix = document.body.dataset.routePrefix || "";
    const receiptKey = "goalboard-project-rules-receipt:" + routePrefix;
    const receipt = document.querySelector("[data-project-rules-receipt]");
    const errorBox = form.querySelector("[data-policy-error]");
    const submit = form.querySelector('button[type="submit"]');
    try {
      const savedReceipt = JSON.parse(sessionStorage.getItem(receiptKey) || "null");
      sessionStorage.removeItem(receiptKey);
      if (receipt && savedReceipt?.title && savedReceipt?.detail) {
        receipt.querySelector("[data-project-rules-receipt-title]").textContent = savedReceipt.title;
        receipt.querySelector("[data-project-rules-receipt-detail]").textContent = savedReceipt.detail;
        receipt.hidden = false;
        receipt.focus({ preventScroll: true });
      }
    } catch {}
    const reveal = (field) => {
      let parent = field.parentElement;
      while (parent && parent !== form) {
        if (parent.tagName === "DETAILS") parent.open = true;
        parent = parent.parentElement;
      }
    };
    const fail = (field, message) => {
      reveal(field);
      field.setAttribute("aria-invalid", "true");
      errorBox.textContent = message;
      errorBox.hidden = false;
      field.focus();
    };
    form.addEventListener("input", (event) => {
      event.target?.removeAttribute?.("aria-invalid");
      errorBox.hidden = true;
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = new FormData(form);
      const reason = String(values.get("reason") || "").trim();
      if (!reason) {
        fail(form.elements.reason, L("请说明为什么要调整项目默认规则。"));
        return;
      }
      const crossReviewers = Number(values.get("cross_reviewers"));
      const adversarialReviewers = Number(values.get("adversarial_reviewers"));
      const leaseSeconds = Number(values.get("max_lease_seconds"));
      if (!Number.isInteger(crossReviewers) || crossReviewers < 0) {
        fail(form.elements.cross_reviewers, L("独立复核人数需要是 0 或正整数。"));
        return;
      }
      if (!Number.isInteger(adversarialReviewers) || adversarialReviewers < 0) {
        fail(form.elements.adversarial_reviewers, L("反例检查人数需要是 0 或正整数。"));
        return;
      }
      if (!Number.isInteger(leaseSeconds) || leaseSeconds <= 0) {
        fail(form.elements.max_lease_seconds, L("一次领取时长需要是正整数秒数。"));
        return;
      }
      const capabilities = String(values.get("required_capabilities") || "")
        .split(/[\\n,，]/)
        .map((item) => item.trim())
        .filter(Boolean);
      const submitLabel = submit.textContent;
      submit.disabled = true;
      submit.textContent = L("正在保存…");
      errorBox.hidden = true;
      try {
        const response = await fetch(routePrefix + "/api/policy-bindings", {
          method: "POST",
          headers: goalboardControlHeaders(),
          body: JSON.stringify({
            scope: "project_default",
            reason,
            policy: {
              goal_mode: values.get("goal_mode"),
              self_verification: values.has("self_verification"),
              cross_reviewers: crossReviewers,
              adversarial_reviewers: adversarialReviewers,
              human_approval: values.has("human_approval"),
              required_capabilities: [...new Set(capabilities)],
              max_lease_seconds: leaseSeconds,
            },
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || L("项目默认工作规则保存失败"));
        const modeLabels = { disabled: L("不要求"), preferred: L("建议使用"), required: L("必须使用") };
        sessionStorage.setItem(receiptKey, JSON.stringify({
          title: L("项目工作规则已保存"),
          detail: L("这个项目的共同规则已更新：按 Goal 工作“{mode}”，执行者自检“{self}”，用户确认“{human}”。之后开始或重新领取的 Goal 会采用这些规则。", {
            mode: modeLabels[values.get("goal_mode")] || String(values.get("goal_mode") || ""),
            self: values.has("self_verification") ? L("需要") : L("不需要"),
            human: values.has("human_approval") ? L("需要") : L("不需要"),
          }),
        }));
        location.reload();
      } catch (error) {
        errorBox.textContent = error.message || L("项目默认工作规则保存失败，请检查输入后重试");
        errorBox.hidden = false;
        submit.disabled = false;
        submit.textContent = submitLabel;
      }
    });
  })();
`;

export const PROJECT_GUIDANCE_CLIENT_SCRIPT = `
  (() => {
    const editor = document.querySelector("[data-guidance-editor]");
    const form = document.querySelector("[data-guidance-form]");
    const dataNode = document.querySelector("#project-guidance-data");
    if (!editor || !form || !dataNode) return;
    const routePrefix = document.body.dataset.routePrefix || "";
    const state = JSON.parse(dataNode.textContent || "{}");
    const entries = [...(state.entries || []), ...(state.inactive_entries || [])];
    const fields = form.querySelector("[data-guidance-editor-fields]");
    const preview = form.querySelector("[data-guidance-editor-preview]");
    const title = editor.querySelector("[data-guidance-editor-title]");
    const description = editor.querySelector("[data-guidance-editor-description]");
    const errorBox = form.querySelector("[data-guidance-editor-error]");
    const submit = form.querySelector('button[type="submit"]');
    const modeInput = form.elements.action;
    const idInput = form.elements.guidance_id;
    const kindInput = form.elements.kind;
    const contentInput = form.elements.content;
    const reasonInput = form.elements.reason;
    let returnFocus = null;
    const labels = {
      add: { title: L("新增项目说明"), description: L("保存后会立即成为所有 Goal 共享的长期上下文。"), submit: L("保存说明") },
      edit: { title: L("修改项目说明"), description: L("原版本会保留在下方的版本记录中。"), submit: L("保存新版本") },
      deactivate: { title: L("停用项目说明"), description: L("停用后 Runtime 不再收到这条说明，历史版本仍会保留。"), submit: L("确认停用") },
      restore: { title: L("恢复项目说明"), description: L("恢复后这条说明会重新进入 Runtime Prompt。"), submit: L("确认恢复") },
    };
    const openEditor = (mode, guidanceId = "", trigger = null) => {
      const entry = entries.find((item) => item.guidance_id === guidanceId);
      const copy = labels[mode] || labels.add;
      returnFocus = trigger instanceof HTMLElement
        ? trigger
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      form.reset();
      modeInput.value = mode;
      idInput.value = guidanceId;
      title.textContent = copy.title;
      description.textContent = copy.description;
      submit.textContent = copy.submit;
      errorBox.hidden = true;
      const editsContent = mode === "add" || mode === "edit";
      fields.hidden = !editsContent;
      kindInput.disabled = !editsContent;
      contentInput.disabled = !editsContent;
      preview.hidden = editsContent;
      if (entry) {
        kindInput.value = entry.kind;
        contentInput.value = entry.content;
        preview.textContent = entry.content;
      } else {
        kindInput.value = "context";
        contentInput.value = "";
        preview.textContent = "";
      }
      reasonInput.value = "";
      editor.hidden = false;
      const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      editor.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      setTimeout(() => (editsContent ? contentInput : reasonInput).focus(), reduceMotion ? 0 : 220);
    };
    const closeEditor = () => {
      const focusTarget = returnFocus;
      editor.hidden = true;
      form.reset();
      errorBox.hidden = true;
      returnFocus = null;
      focusTarget?.focus();
    };
    const bindEditorTrigger = (button, mode, guidanceId = "") => {
      const open = () => openEditor(mode, guidanceId, button);
      button.addEventListener("click", open);
      button.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        open();
      });
    };
    document.querySelectorAll("[data-guidance-new]").forEach((button) => {
      bindEditorTrigger(button, "add");
    });
    document.querySelectorAll("[data-guidance-edit]").forEach((button) => {
      bindEditorTrigger(button, "edit", button.dataset.guidanceEdit);
    });
    document.querySelectorAll("[data-guidance-action]").forEach((button) => {
      bindEditorTrigger(button, button.dataset.guidanceAction, button.dataset.guidanceId);
    });
    editor.querySelectorAll("[data-guidance-editor-close]").forEach((button) => {
      button.addEventListener("click", closeEditor);
    });
    editor.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeEditor();
    });
    form.addEventListener("input", () => { errorBox.hidden = true; });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const mode = modeInput.value;
      const guidanceId = idInput.value;
      const content = String(contentInput.value || "").trim();
      const reason = String(reasonInput.value || "").trim();
      if ((mode === "add" || mode === "edit") && !content) {
        errorBox.textContent = L("请填写项目说明原文。");
        errorBox.hidden = false;
        contentInput.focus();
        return;
      }
      if (!reason) {
        errorBox.textContent = L("请说明为什么要做这次变更。");
        errorBox.hidden = false;
        reasonInput.focus();
        return;
      }
      const submitLabel = submit.textContent;
      submit.disabled = true;
      submit.textContent = L("正在保存…");
      try {
        const isAdd = mode === "add";
        const response = await fetch(
          isAdd ? routePrefix + "/api/project-guidance" : routePrefix + "/api/project-guidance/" + encodeURIComponent(guidanceId),
          {
            method: isAdd ? "POST" : "PATCH",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({
              action: isAdd ? undefined : mode,
              kind: isAdd || mode === "edit" ? kindInput.value : undefined,
              content: isAdd || mode === "edit" ? content : undefined,
              reason,
              user_confirmed: true,
            }),
          },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || L("项目说明保存失败"));
        sessionStorage.setItem("goalboard-guidance-receipt:" + routePrefix, copyReceipt(mode));
        location.reload();
      } catch (error) {
        errorBox.textContent = error.message || L("项目说明保存失败，请检查输入后重试");
        errorBox.hidden = false;
        submit.disabled = false;
        submit.textContent = submitLabel;
      }
    });
    const receipt = document.querySelector("[data-guidance-receipt]");
    try {
      const saved = sessionStorage.getItem("goalboard-guidance-receipt:" + routePrefix);
      sessionStorage.removeItem("goalboard-guidance-receipt:" + routePrefix);
      if (receipt && saved) {
        receipt.textContent = saved;
        receipt.hidden = false;
      }
    } catch {}
    function copyReceipt(mode) {
      if (mode === "edit") return L("项目说明的新版本已生效。");
      if (mode === "deactivate") return L("项目说明已停用，Runtime 将不再收到它。");
      if (mode === "restore") return L("项目说明已恢复，并重新进入 Runtime Prompt。");
      return L("项目说明已新增，并会用于后续 Goal。");
    }
  })();
`;


