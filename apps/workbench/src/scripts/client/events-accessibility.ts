/** AP3 Workbench client segment: events-accessibility. */
export const CLIENT_EVENTS_ACCESSIBILITY_SCRIPT = `      }
    });

    document.addEventListener("submit", async (event) => {
      const submittedForm = event.target;
      const goalTrashForm = submittedForm.closest?.("[data-goal-trash-form]");
      if (goalTrashForm) {
        event.preventDefault();
        await submitGoalTrashForm();
        return;
      }
      const goalTreeDecisionForm = submittedForm.closest?.("[data-goal-tree-decision-form]");
      if (goalTreeDecisionForm) {
        event.preventDefault();
        const decision = event.submitter?.value;
        const buttons = [...goalTreeDecisionForm.querySelectorAll('button[type="submit"]')];
        const errorBox = goalTreeDecisionForm.querySelector("[data-decision-error]");
        const values = new FormData(goalTreeDecisionForm);
        const reason = String(values.get("reason") || "").trim();
        const itemIds = values.getAll("item_id").map((value) => String(value));
        const receiptContext = decisionReceiptContext(goalTreeDecisionForm);
        const hasSystemIssues = goalTreeDecisionForm.dataset.hasSystemIssues === "true";
        if (decision === "repair-risks") {
          const repairs = [];
          let firstMissing = null;
          for (const repairGroup of goalTreeDecisionForm.querySelectorAll("[data-risk-proposal-repair]")) {
            const selected = repairGroup.querySelector('input[type="radio"]:checked');
            const localError = repairGroup.querySelector("[data-risk-repair-error]");
            if (!selected) {
              localError.textContent = L("请选择这条风险的处理方式");
              localError.hidden = false;
              firstMissing ||= repairGroup.querySelector('input[type="radio"]');
              continue;
            }
            localError.hidden = true;
            repairs.push({
              item_id: repairGroup.dataset.riskItemId,
              treatment: selected.value,
              treatment_plan: String(repairGroup.querySelector("[data-risk-treatment-plan]")?.value || "").trim(),
            });
          }
          if (firstMissing) {
            firstMissing.focus();
            return;
          }
          if (!repairs.length) {
            errorBox.textContent = L("这份方案已经变化，暂时不能提交。请刷新后重试。");
            errorBox.hidden = false;
            return;
          }
          const submitLabel = event.submitter?.textContent;
          const buttonStates = buttons.map((button) => button.disabled);
          buttons.forEach((button) => { button.disabled = true; });
          if (event.submitter) event.submitter.textContent = L("正在保存…");
          errorBox.hidden = true;
          try {
            const response = await fetch(route("/api/goal-tree-proposals/" + encodeURIComponent(goalTreeDecisionForm.dataset.goalTreeProposalId) + "/decision"), {
              method: "POST",
              headers: goalboardControlHeaders(),
              body: JSON.stringify({ risk_repairs: repairs }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || L("风险处理保存失败"));
            await refreshBoardWithDecisionReceipt(
              L("风险处理已保存。方案的其他内容没有改变，仍需补全的问题会继续显示。"),
              receiptContext,
            );
          } catch (error) {
            errorBox.textContent = humanDecisionError(error.message, L("风险处理保存失败，请重试"));
            errorBox.hidden = false;
            buttons.forEach((button, index) => { button.disabled = buttonStates[index]; });
            if (event.submitter) event.submitter.textContent = submitLabel;
          }
          return;
        }
        if ((decision === "confirm" || (decision === "reject" && !hasSystemIssues)) &&
            requireDecisionText(goalTreeDecisionForm, errorBox, "reason", "请填写决定理由或修改意见")) return;
        if (!itemIds.length) {
          errorBox.textContent = L("这份方案已经变化，暂时不能提交。请让 Runtime 按最新状态重新整理。");
          errorBox.hidden = false;
          return;
        }
        const submitLabel = event.submitter?.textContent;
        const buttonStates = buttons.map((button) => button.disabled);
        buttons.forEach((button) => { button.disabled = true; });
        if (event.submitter) event.submitter.textContent = L("正在保存…");
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/goal-tree-proposals/" + encodeURIComponent(goalTreeDecisionForm.dataset.goalTreeProposalId) + "/decision"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({
              ...(decision === "confirm"
                ? { confirm_all_pending: true }
                : { decisions: itemIds.map((itemId) => ({ item_id: itemId, decision, reason })) }),
              reason,
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("方案决定提交失败"));
          if (Array.isArray(result.conflict_item_ids) && result.conflict_item_ids.length) {
            throw new Error(L("GoalBoard 已经发生变化。请让 Runtime 更新方案后再决定。"));
          }
          await refreshBoardWithDecisionReceipt(
            decision === "confirm" ? L("这份 Goal 方案已经采用，相关 Goal 和关系已更新。") : L("这份 Goal 方案已退回，当前 Goal Tree 保持不变。"),
            receiptContext,
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, L("方案决定提交失败，请重试"));
          errorBox.hidden = false;
          buttons.forEach((button, index) => { button.disabled = buttonStates[index]; });
          if (event.submitter) event.submitter.textContent = submitLabel;
        }
        return;
      }
      const contractDecisionForm = submittedForm.closest?.("[data-contract-decision-form]");
      if (contractDecisionForm) {
        event.preventDefault();
        const decision = event.submitter?.value;
        await submitDecisionForm(
          contractDecisionForm,
          event.submitter,
          "/api/contract-proposals/" + encodeURIComponent(contractDecisionForm.dataset.contractProposalId) + "/decision",
          decision,
          decision === "approved" ? L("目标说明已确认，现在可以进入执行。") : L("目标说明已退回，草稿保持不变。"),
        );
        return;
      }

      const candidateDecisionForm = submittedForm.closest?.("[data-candidate-decision-form]");
      if (candidateDecisionForm) {
        event.preventDefault();
        const decision = event.submitter?.value;
        await submitDecisionForm(
          candidateDecisionForm,
          event.submitter,
          "/api/candidates/" + encodeURIComponent(candidateDecisionForm.dataset.candidateId) + "/decision",
          decision,
          decision === "approved" ? L("新工作已加入 Goal Tree；需要调整关系时会继续出现在这里。") : L("这项新工作暂未加入，你的意见已保留。"),
        );
        return;
      }

      const rewireDecisionForm = submittedForm.closest?.("[data-rewire-decision-form]");
      if (rewireDecisionForm) {
        event.preventDefault();
        const decision = event.submitter?.value;
        await submitDecisionForm(
          rewireDecisionForm,
          event.submitter,
          "/api/rewires/" + encodeURIComponent(rewireDecisionForm.dataset.rewireId) + "/decision",
          decision,
          decision === "confirmed"
            ? (result) => {
                const impact = result?.rewire?.impact || {};
                const added = Array.isArray(impact.added_relation_ids) ? impact.added_relation_ids.length : 0;
                const removed = Array.isArray(impact.deactivated_relation_ids) ? impact.deactivated_relation_ids.length : 0;
                const risks = Array.isArray(impact.added_risk_ids) ? impact.added_risk_ids.length : 0;
                const changes = [];
                if (added) changes.push(L("新增 {count} 条关系", { count: added }));
                if (removed) changes.push(L("解除 {count} 条关系", { count: removed }));
                if (risks) changes.push(L("新增 {count} 项风险", { count: risks }));
                return changes.length
                  ? L("已{changes}。", { changes: changes.join("、") })
                  : L("决定已记录，但这次没有新增或解除 Goal 关系，也没有新增风险。");
              }
            : L("这次调整未采用，现有 Goal 关系没有改变。"),
        );
        return;
      }

      const relationForm = submittedForm.closest?.("[data-relation-form]");
      if (relationForm) {
        event.preventDefault();
        const submit = relationForm.querySelector('button[type="submit"]');
        const errorBox = relationForm.querySelector("[data-relation-error]");
        if (requireFormFacts(relationForm, errorBox)) return;
        const values = new FormData(relationForm);
        const relationSummary = relationForm.querySelector("[data-relation-live-preview] strong")?.textContent?.trim() || L("当前 Goal 的关系");
        const submitLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = L("正在保存…");
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/goals/" + encodeURIComponent(relationForm.dataset.goalId) + "/relations"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({
              direction: values.get("direction"),
              type: values.get("type"),
              target_goal_id: values.get("target_goal_id"),
              reason: String(values.get("reason") || "").trim(),
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "关系建立失败");
          await refreshBoard(true);
          showFactorReceipt(
            "relations",
            L("关系已建立"),
            L("已建立：{relation}。准确方向和建立原因已进入完整记录。", { relation: relationSummary }),
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, L("关系建立失败，请检查目标、方向和原因"));
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
        return;
      }

      const relationDeactivateForm = submittedForm.closest?.("[data-relation-deactivate-form]");
      if (relationDeactivateForm) {
        event.preventDefault();
        const submit = relationDeactivateForm.querySelector('button[type="submit"]');
        const errorBox = relationDeactivateForm.querySelector("[data-relation-deactivate-error]");
        if (requireDecisionText(relationDeactivateForm, errorBox, "reason", "请填写解除原因。说明这条关系为什么不再成立。")) return;
        const reason = String(new FormData(relationDeactivateForm).get("reason") || "").trim();
        const relatedGoal = relationDeactivateForm.closest(".relation-record")?.querySelector(".relation-copy strong")?.textContent?.trim() || L("另一个 Goal");
        submit.disabled = true;
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/relations/" + encodeURIComponent(relationDeactivateForm.dataset.relationId) + "/deactivate"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({ reason }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "关系解除失败");
          await refreshBoard(true);
          showFactorReceipt(
            "relations",
            L("关系已解除"),
            L("与「{goal}」的关系已停止生效；原方向和解除原因仍保留在完整记录中。", { goal: relatedGoal }),
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, L("关系解除失败，请检查解除原因后重试"));
          errorBox.hidden = false;
          submit.disabled = false;
        }
        return;
      }

      const draftForm = submittedForm.closest?.("[data-draft-form]");
      if (draftForm) {
        event.preventDefault();
        const submit = draftForm.querySelector('button[type="submit"]');
        const errorBox = draftForm.querySelector("[data-draft-error]");
        const values = new FormData(draftForm);
        const acceptanceCriteria = [...draftForm.querySelectorAll("[data-criterion-row]")]
          .map((row) => {
            const read = (field) => String(row.querySelector('[data-criterion-field="' + field + '"]')?.value || "").trim();
            const statement = read("statement");
            const passCondition = read("pass_condition");
            if (!statement && !passCondition) return null;
            return {
              criterion_id: read("criterion_id") || undefined,
              statement,
              decision_method: read("decision_method") || "inspection",
              pass_condition: passCondition,
              target: parseCriterionTarget(read("target")),
              required_evidence: [...new Set(read("required_evidence").split(/[,，\\n]/).map((item) => item.trim()).filter(Boolean))],
            };
          })
          .filter(Boolean);
        submit.disabled = true;
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/goals/" + encodeURIComponent(draftForm.dataset.goalId) + "/draft"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({
              title: String(values.get("title") || "").trim(),
              outcome: String(values.get("outcome") || "").trim(),
              why: String(values.get("why") || "").trim(),
              business_logic: String(values.get("business_logic") || "").trim(),
              in_scope: splitLines(values.get("in_scope")),
              out_of_scope: splitLines(values.get("out_of_scope")),
              constraints: splitLines(values.get("constraints")),
              required_inputs: splitLines(values.get("required_inputs")),
              promised_outputs: splitLines(values.get("promised_outputs")),
              decomposition_state: values.get("decomposition_state"),
              priority: Number(values.get("priority")),
              acceptance_criteria: acceptanceCriteria,
              reason: String(values.get("reason") || "").trim(),
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Draft 保存失败");
          await refreshBoard(true);
          showToast(L("草稿修改已保存"));
        } catch (error) {
          errorBox.textContent = error.message || "Draft 保存失败，请检查输入";
          errorBox.hidden = false;
          submit.disabled = false;
        }
        return;
      }

      const riskCreateForm = submittedForm.closest?.("[data-risk-create-form]");
      if (riskCreateForm) {
        event.preventDefault();
        const submit = riskCreateForm.querySelector('button[type="submit"]');
        const errorBox = riskCreateForm.querySelector("[data-risk-error]");
        if (requireFormFacts(riskCreateForm, errorBox)) return;
        const values = new FormData(riskCreateForm);
        if (!values.getAll("goal_ids").length) {
          const picker = riskCreateForm.querySelector(".risk-goal-picker");
          if (picker) picker.open = true;
          errorBox.textContent = L("请至少选择一条受影响的 Goal");
          errorBox.hidden = false;
          picker?.querySelector('input[name="goal_ids"]')?.focus();
          return;
        }
        const submitLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = L("正在保存…");
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/goals/" + encodeURIComponent(riskCreateForm.dataset.goalId) + "/risks"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify(readRiskPayload(values)),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("风险记录失败"));
          await refreshBoard(true);
          const description = result?.risk?.description || String(values.get("description") || "").trim();
          showFactorReceipt(
            "risks",
            L("风险已记录"),
            L("已记录风险「{description}」。它现在保持待处理；需要确认处理结果时，请到待决定。", { description }),
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, L("风险记录失败，请检查输入后重试"));
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
        return;
      }

      const riskEditForm = submittedForm.closest?.("[data-risk-edit-form]");
      if (riskEditForm) {
        event.preventDefault();
        const submit = riskEditForm.querySelector('button[type="submit"]');
        const errorBox = riskEditForm.querySelector("[data-risk-error]");
        if (requireFormFacts(riskEditForm, errorBox)) return;
        const values = new FormData(riskEditForm);
        if (!values.getAll("goal_ids").length) {
          const picker = riskEditForm.querySelector(".risk-goal-picker");
          if (picker) picker.open = true;
          errorBox.textContent = L("请至少选择一条受影响的 Goal");
          errorBox.hidden = false;
          picker?.querySelector('input[name="goal_ids"]')?.focus();
          return;
        }
        const submitLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = L("正在保存…");
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/risks/" + encodeURIComponent(riskEditForm.dataset.riskId) + "/update"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify(readRiskPayload(values)),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("风险更新失败"));
          await refreshBoard(true);
          const description = result?.risk?.description || String(values.get("description") || "").trim();
          showFactorReceipt(
            "risks",
            L("风险信息已更新"),
            L("已更新风险「{description}」。这次修改没有改变它的处理结果。", { description }),
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, L("风险更新失败，请检查输入后重试"));
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
        return;
      }

      const riskStateForm = submittedForm.closest?.("[data-risk-state-form]");
      if (riskStateForm) {
        event.preventDefault();
        const submit = riskStateForm.querySelector('button[type="submit"]');
        const errorBox = riskStateForm.querySelector("[data-risk-error]");
        const receiptContext = decisionReceiptContext(riskStateForm);
        if (requireDecisionText(riskStateForm, errorBox, "state", "请选择风险处理结果，再保存。")) return;
        if (requireDecisionText(riskStateForm, errorBox, "reason", "请填写决定理由。说明你为什么这样选择，以及依据是什么。")) return;
        const values = new FormData(riskStateForm);
        if (values.get("state") === "resolved") {
          if (requireDecisionText(riskStateForm, errorBox, "resolution_summary", "请写清什么事实证明这条风险已经解决。")) return;
          if (requireDecisionText(riskStateForm, errorBox, "resolution_evidence_refs", "请至少填写一条可追溯的证据引用。")) return;
        }
        const submitLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = L("正在保存…");
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/risks/" + encodeURIComponent(riskStateForm.dataset.riskId) + "/state"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({
              state: values.get("state"),
              reason: String(values.get("reason") || "").trim(),
              goal_id: riskStateForm.dataset.goalId,
              action_id: riskStateForm.dataset.actionId,
              action_token: riskStateForm.dataset.actionToken,
              contract_revision: Number(riskStateForm.dataset.contractRevision),
              ...(values.get("state") === "resolved" ? {
                resolution_basis: {
                  summary: String(values.get("resolution_summary") || "").trim(),
                  evidence_refs: String(values.get("resolution_evidence_refs") || "").split(/[\\n]+/).map((value) => value.trim()).filter(Boolean),
                  residual_gaps: String(values.get("resolution_residual_gaps") || "").split(/[\\n]+/).map((value) => value.trim()).filter(Boolean),
                },
              } : {}),
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Risk 状态更新失败");
          const resultState = result?.decision || result?.risk?.state;
          const resultMessages = {
            open: L("风险保持待处理，仍会留在待决定中，并继续按当前规则影响关联 Goal。"),
            triggered: L("风险已标记为发生，仍会留在待决定中，并继续按当前规则影响关联 Goal。"),
            resolved: L("风险已标记为解决，不再阻止关联 Goal。"),
            accepted: L("风险已接受，不再阻止关联 Goal。"),
            expired: L("风险已过期，不再继续跟踪或阻止关联 Goal。"),
            rejected: L("你没有接受这项风险，已改为由 Runtime 继续处理。"),
          };
          await refreshBoardWithDecisionReceipt(
            resultMessages[resultState] || L("风险处理方式已记录。"),
            receiptContext,
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, "风险决定保存失败，请检查输入后重试");
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
        return;
      }

      const impactCreateForm = submittedForm.closest?.("[data-impact-create-form]");
      if (impactCreateForm) {
        event.preventDefault();
        const submit = impactCreateForm.querySelector('button[type="submit"]');
        const errorBox = impactCreateForm.querySelector("[data-impact-error]");
        if (requireFormFacts(impactCreateForm, errorBox)) return;
        const values = new FormData(impactCreateForm);
        const submitLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = L("正在保存…");
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/goals/" + encodeURIComponent(impactCreateForm.dataset.goalId) + "/impacts"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify(readImpactPayload(values)),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("影响范围记录失败"));
          await refreshBoard(true);
          const surface = result?.impact?.surface || result?.surface || String(values.get("surface") || "").trim();
          showFactorReceipt(
            "impacts",
            L("影响范围已记录"),
            L("已记录「{surface}」。它已绑定当前 Goal，并按保存的确认状态参与工作冲突判断。", { surface }),
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, L("影响范围记录失败，请检查输入后重试"));
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
        return;
      }

      const impactEditForm = submittedForm.closest?.("[data-impact-edit-form]");
      if (impactEditForm) {
        event.preventDefault();
        const submit = impactEditForm.querySelector('button[type="submit"]');
        const errorBox = impactEditForm.querySelector("[data-impact-error]");
        if (requireFormFacts(impactEditForm, errorBox)) return;
        const values = new FormData(impactEditForm);
        const submitLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = L("正在保存…");
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/impacts/" + encodeURIComponent(impactEditForm.dataset.impactId) + "/update"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify(readImpactPayload(values)),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("影响范围更新失败"));
          await refreshBoard(true);
          const surface = result?.impact?.surface || result?.surface || String(values.get("surface") || "").trim();
          showFactorReceipt(
            "impacts",
            L("影响范围已更新"),
            L("已更新「{surface}」。旧值和修改说明已进入完整记录。", { surface }),
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, L("影响范围更新失败，请检查输入后重试"));
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
        return;
      }

      const impactDeactivateForm = submittedForm.closest?.("[data-impact-deactivate-form]");
      if (impactDeactivateForm) {
        event.preventDefault();
        const submit = impactDeactivateForm.querySelector('button[type="submit"]');
        const errorBox = impactDeactivateForm.querySelector("[data-impact-error]");
        if (requireDecisionText(impactDeactivateForm, errorBox, "reason", "请填写停用原因。说明这条影响范围为什么不再有效。")) return;
        const values = new FormData(impactDeactivateForm);
        const surface = impactDeactivateForm.closest(".impact-record")?.querySelector("h4")?.textContent?.trim() || L("这条影响范围");
        submit.disabled = true;
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/impacts/" + encodeURIComponent(impactDeactivateForm.dataset.impactId) + "/deactivate"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({ reason: String(values.get("reason") || "").trim() }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Impact 停用失败");
          await refreshBoard(true);
          showFactorReceipt(
            "impacts",
            L("影响范围已停用"),
            L("「{surface}」不再参与工作冲突判断；原记录和停用原因仍会保留。", { surface }),
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(error.message, L("影响范围停用失败，请检查停用原因后重试"));
          errorBox.hidden = false;
          submit.disabled = false;
        }
        return;
      }

      const evidenceForm = submittedForm.closest?.("[data-evidence-form]");
      if (evidenceForm) {
        event.preventDefault();
        const submit = evidenceForm.querySelector('button[type="submit"]');
        const errorBox = evidenceForm.querySelector("[data-evidence-error]");
        const values = new FormData(evidenceForm);
        const criterionIds = [...new Set(values.getAll("criterion_ids").map(String).map((value) => value.trim()).filter(Boolean))];
        if (!criterionIds.length) {
          errorBox.textContent = "至少选择一条验收条件";
          errorBox.hidden = false;
          return;
        }
        const submitLabel = submit.textContent;
        submit.disabled = true;
        submit.textContent = L("正在保存…");
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/goals/" + encodeURIComponent(evidenceForm.dataset.goalId) + "/evidence"), {
            method: "POST",
            headers: goalboardControlHeaders(),
            body: JSON.stringify({
              criterion_ids: criterionIds,
              kind: values.get("kind"),
              result: values.get("result"),
              locator: String(values.get("locator") || "").trim(),
              digest: String(values.get("digest") || "").trim(),
              action_token: evidenceForm.dataset.actionToken,
              contract_revision: Number(evidenceForm.dataset.contractRevision),
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("完成依据记录失败"));
          await refreshBoard(true);
          showToast(result?.transition?.summary || L("完成依据已记录，并已绑定到当前 Goal"));
        } catch (error) {
          errorBox.textContent = error.message || L("完成依据记录失败，请检查输入后重试");
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
        return;
      }

      const policyForm = submittedForm.closest?.("[data-policy-form]");
      if (policyForm) {
        event.preventDefault();
        const submit = policyForm.querySelector('button[type="submit"]');
        const errorBox = policyForm.querySelector("[data-policy-error]");
        if (requireFormFacts(policyForm, errorBox)) return;
        const minimumViolation = [...policyForm.querySelectorAll("[data-policy-min]")].find((field) => Number(field.value) < Number(field.dataset.policyMin));
        const maximumViolation = [...policyForm.querySelectorAll("[data-policy-max]")].find((field) => Number(field.value) > Number(field.dataset.policyMax));
        const policyLimitViolation = minimumViolation || maximumViolation;
`;

