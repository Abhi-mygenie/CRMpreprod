import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Save, Send, Plus, X, Loader2, CheckCircle, Clock, XCircle, AlertTriangle, Image, Video, FileText, Link2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";
import { MediaHeaderUpload } from "@/components/templates/MediaHeaderUpload";

const NAME_REGEX = /^[a-z0-9_]*$/;
const LIMITS = { name: 512, body: 1024, footer: 60, header_text: 60, button_text: 25 };
const SINGLE_BRACE_RE = /(?<!\{)\{(\d+)\}(?!\})/g;
const DOUBLE_BRACE_RE = /\{\{(\d+)\}\}/g;
const URL_RE = /^https?:\/\/.+\..+/;
const PHONE_RE = /^\+\d{7,15}$/;

// V1-V23 Meta compliance validation (CR-066) — returns { valid, errors, warnings }
function validateMetaCompliance(tpl) {
  const errors = [];
  const warnings = []; // BUG-015: soft warnings (non-blocking)
  const body = tpl.body || "";
  const footer = tpl.footer || "";
  const headerContent = tpl.header_content || "";
  const name = tpl.template_name || "";

  // V9: Name cannot start with underscore
  if (name.startsWith("_")) errors.push("Template name cannot start with an underscore");

  // V1: Single-brace detection in body, header, footer
  const singleBody = [...body.matchAll(SINGLE_BRACE_RE)].map(m => `{${m[1]}}`);
  const singleHeader = [...headerContent.matchAll(SINGLE_BRACE_RE)].map(m => `{${m[1]}}`);
  const singleFooter = [...footer.matchAll(SINGLE_BRACE_RE)].map(m => `{${m[1]}}`);
  if (singleBody.length > 0) errors.push(`Body has single-brace variables (${singleBody.join(", ")}). Use double braces: {{1}}, {{2}}`);
  if (singleHeader.length > 0) errors.push(`Header has single-brace variables (${singleHeader.join(", ")}). Use {{1}} instead`);
  if (singleFooter.length > 0) errors.push(`Footer has single-brace variables (${singleFooter.join(", ")}). Variables are not allowed in footer`);

  // V2: Sequential variable numbering in body
  const bodyNums = [...new Set([...body.matchAll(DOUBLE_BRACE_RE)].map(m => parseInt(m[1])))].sort((a, b) => a - b);
  if (bodyNums.length > 0) {
    if (bodyNums[0] !== 1) errors.push("Body variables must start at {{1}}");
    for (let i = 1; i < bodyNums.length; i++) {
      if (bodyNums[i] !== bodyNums[i - 1] + 1) {
        errors.push(`Body variables not sequential: found {{${bodyNums[i - 1]}}} then {{${bodyNums[i]}}} — missing {{${bodyNums[i - 1] + 1}}}`);
        break;
      }
    }
  }

  // V3: Footer cannot contain variables
  if (DOUBLE_BRACE_RE.test(footer)) errors.push("Footer cannot contain variables ({{N}}). Meta does not support footer variables");
  DOUBLE_BRACE_RE.lastIndex = 0; // reset regex state

  // V4: Header text — max 1 variable, must be {{1}}
  if (tpl.header_type === "text" && headerContent) {
    const headerVars = [...headerContent.matchAll(DOUBLE_BRACE_RE)].map(m => parseInt(m[1]));
    if (headerVars.length > 1) errors.push(`Header text allows only 1 variable ({{1}}). Found ${headerVars.length} variables`);
    else if (headerVars.length === 1 && headerVars[0] !== 1) errors.push("Header variable must be {{1}}");
  }

  // V5: URL button must have valid URL
  // V6: Phone button must have valid phone number
  // V7: Quick Reply text cannot be empty
  (tpl.buttons || []).forEach((btn, i) => {
    const n = i + 1;
    if (btn.type === "URL") {
      if (btn.url_type === "dynamic") {
        // Check composed url OR url_base — either must be valid
        const baseUrl = (btn.url_base || "").trim() || (btn.url || "").replace(/\{\{1\}\}$/, "").trim();
        if (!URL_RE.test(baseUrl)) errors.push(`Button ${n}: Base URL is required for dynamic URL`);
        if (!(btn.url_example || "").trim()) errors.push(`Button ${n}: Example URL required by Meta for dynamic URL approval`);
      } else {
        if (!URL_RE.test(btn.url || "")) errors.push(`Button ${n}: URL is required and must start with http:// or https://`);
      }
    }
    if (btn.type === "PHONE_NUMBER" && !PHONE_RE.test(btn.phone_number || "")) errors.push(`Button ${n}: Phone number must be international format (e.g., +919876543210)`);
    if (btn.type === "QUICK_REPLY" && !(btn.text || "").trim()) errors.push(`Button ${n}: Quick Reply text is required`);
  });

  // V8: Media — must have uploaded file (CR-036 B.1)
  if (["image", "video", "document"].includes(tpl.header_type) && !tpl.header_handle && !tpl.send_media_url) {
    errors.push(`Please upload a media file for the ${tpl.header_type} header.`);
  }

  // CR-036 B.1 Q18: block {{n}} in media header content
  if (["image", "video", "document"].includes(tpl.header_type) && /\{\{\d+\}\}/.test(tpl.header_content || "")) {
    errors.push("Dynamic variables {{n}} are not supported in media header content.");
  }

  // V10: Example values cannot contain {{
  (tpl.body_examples || []).forEach((ex, i) => {
    if (ex && ex.includes("{{")) errors.push(`Body example ${i + 1} cannot contain "{{" — provide a real sample value`);
  });
  (tpl.header_examples || []).forEach((ex, i) => {
    if (ex && ex.includes("{{")) errors.push(`Header example ${i + 1} cannot contain "{{" — provide a real sample value`);
  });

  // ── CR-066 V11: Unmatched formatting markers (HARD BLOCK) ──
  const underscoreCount = (body.match(/_/g) || []).length;
  if (underscoreCount % 2 !== 0) errors.push("Body has an unmatched _ (italic marker). Each _ must have a closing _");
  const tildeCount = (body.match(/~/g) || []).length;
  if (tildeCount % 2 !== 0) errors.push("Body has an unmatched ~ (strikethrough marker). Each ~ must have a closing ~");
  const monoCount = (body.match(/```/g) || []).length;
  if (monoCount % 2 !== 0) errors.push("Body has an unmatched ``` (monospace marker). Each ``` must have a closing ```");
  const allStars = (body.match(/\*/g) || []).length;
  const bulletStars = (body.match(/(?:^|\n)\* /g) || []).length;
  const boldStars = allStars - bulletStars;
  if (boldStars % 2 !== 0) errors.push("Body has an unmatched * (bold marker). Each *bold* must have a closing *. Tip: use \u2022 instead of * for bullet points");

  // CR-066 V12: Variable at start/end of body (HARD BLOCK)
  const trimmedBody = body.trim();
  if (/^\{\{\d+\}\}/.test(trimmedBody)) errors.push("Body cannot start with a variable ({{N}}). Add text before the first variable");
  if (/\{\{\d+\}\}$/.test(trimmedBody)) errors.push("Body cannot end with a variable ({{N}}). Add text after the last variable");

  // CR-066 V13: Adjacent variables without text (HARD BLOCK)
  if (/\}\}\s*\{\{/.test(body)) errors.push("Variables cannot be adjacent (e.g., {{1}}{{2}}). Add text between variables");

  // CR-066 V14: Formatting wrapping variables (HARD BLOCK)
  if (/[*_~](\{\{\d+\}\})[*_~]/.test(body)) errors.push("Do not wrap variables in formatting (e.g., *{{1}}* or _{{2}}_). Format the value at send-time instead");

  // CR-066 V15: Body hard character limit (HARD BLOCK)
  if (body.length > 1024) errors.push(`Body exceeds 1024 character limit (${body.length} characters). Shorten the message`);

  // ── CR-066 V16-V20: Meta compliance warnings (HARD BLOCK per Q2) ──
  // V16: Emoji count
  const emojiMatches = body.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}-\u{2B55}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{2733}-\u{2734}\u{2714}-\u{2716}\u{2764}\u{FE0F}]/gu) || [];
  if (emojiMatches.length > 10) errors.push(`Body has ${emojiMatches.length} emojis \u2014 Meta allows maximum 10 per template`);
  // V17: Consecutive newlines
  if (/\n{3,}/.test(body)) errors.push("Body has more than 2 consecutive blank lines. Meta allows maximum 2 newlines in a row");
  // V18: Excessive spaces/tabs
  if (body.includes("\t")) errors.push("Body contains tab characters \u2014 not allowed in template body");
  if (/ {5,}/.test(body)) errors.push("Body has more than 4 consecutive spaces \u2014 not allowed in template body");
  // V19: 550-char threshold for Marketing/Utility — BUG-015: soft warning
  if (body.length > 550 && ["utility", "marketing"].includes(tpl.category)) {
    warnings.push(`Body is ${body.length} characters \u2014 Meta may auto-reject Marketing/Utility templates over 550 characters`);
  }
  // V20: Formatting in header/footer
  if (tpl.header_type === "text" && /[*_~`]/.test(headerContent)) {
    errors.push("Header text cannot contain formatting markers (*, _, ~, \`). Meta does not support formatting in headers");
  }
  if (/[*_~`]/.test(footer)) {
    errors.push("Footer cannot contain formatting markers (*, _, ~, \`). Meta does not support formatting in footers");
  }

  // ── CR-066 V21-V23: Quality checks (HARD BLOCK per Q2) ──
  // V21: Category-content mismatch heuristic
  if (tpl.category === "utility") {
    const promoWords = ["menu", "offer", "discount", "price", "subscribe", "launched", "inquire", "promo", "deal", "sale", "wallet plan"];
    const bodyLower = body.toLowerCase();
    const foundPromo = promoWords.filter(w => bodyLower.includes(w));
    if (foundPromo.length >= 2) warnings.push(`Utility template appears promotional (found: ${foundPromo.join(", ")}). Consider using Marketing category instead`); // BUG-015: soft warning
  }
  // V22: ALL CAPS blocks
  if (/[A-Z\s]{20,}/.test(body) && /[A-Z]{4,}/.test(body)) {
    const capsRun = body.replace(/[^A-Z]/g, "");
    if (capsRun.length >= 20) warnings.push("Body has long ALL-CAPS sections \u2014 Meta may flag as aggressive. Consider mixed case"); // BUG-015: soft warning
  }
  // V23: URL shorteners
  if (/bit\.ly|tinyurl|goo\.gl|ow\.ly|t\.co|is\.gd|buff\.ly/i.test(body)) {
    errors.push("Body contains a URL shortener \u2014 Meta rejects templates with shortened URLs. Use the full URL");
  }

  return { valid: errors.length === 0, errors, warnings }; // BUG-015: return warnings separately
}

// Real-time inline warning helpers
function getBodyWarnings(body) {
  const w = [];
  const singles = [...(body || "").matchAll(SINGLE_BRACE_RE)].map(m => `{${m[1]}}`);
  if (singles.length > 0) w.push(`Use double braces: ${singles.map(s => s.replace("{", "{{").replace("}", "}}")).join(", ")} instead of ${singles.join(", ")}`);
  const nums = [...new Set([...(body || "").matchAll(DOUBLE_BRACE_RE)].map(m => parseInt(m[1])))].sort((a, b) => a - b);
  if (nums.length > 0 && nums[0] !== 1) w.push("Variables must start at {{1}}");
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] !== nums[i - 1] + 1) { w.push(`Missing {{${nums[i - 1] + 1}}} between {{${nums[i - 1]}}} and {{${nums[i]}}}`); break; }
  }
  // CR-066: Real-time formatting marker warnings
  const usCount = ((body || "").match(/_/g) || []).length;
  if (usCount % 2 !== 0) w.push("Unmatched _ (italic) \u2014 add a closing _ or remove the stray one");
  const tildeC = ((body || "").match(/~/g) || []).length;
  if (tildeC % 2 !== 0) w.push("Unmatched ~ (strikethrough) \u2014 add a closing ~");
  const monoC = ((body || "").match(/```/g) || []).length;
  if (monoC % 2 !== 0) w.push("Unmatched ``` (monospace) \u2014 add a closing ```");
  const allS = ((body || "").match(/\*/g) || []).length;
  const bulletS = ((body || "").match(/(?:^|\n)\* /g) || []).length;
  if ((allS - bulletS) % 2 !== 0) w.push("Unmatched * (bold) \u2014 check bold formatting or use \u2022 for bullets");
  return w;
}
function getHeaderWarnings(headerType, headerContent) {
  if (headerType !== "text" || !headerContent) return [];
  const w = [];
  const singles = [...headerContent.matchAll(SINGLE_BRACE_RE)];
  if (singles.length > 0) w.push("Use {{1}} not {1}");
  const vars = [...headerContent.matchAll(DOUBLE_BRACE_RE)].map(m => parseInt(m[1]));
  if (vars.length > 1) w.push("Header allows only 1 variable: {{1}}");
  else if (vars.length === 1 && vars[0] !== 1) w.push("Header variable must be {{1}}");
  return w;
}
function getFooterWarnings(footer) {
  if (!footer) return [];
  const w = [];
  if (SINGLE_BRACE_RE.test(footer)) { w.push("Footer cannot contain variables"); SINGLE_BRACE_RE.lastIndex = 0; }
  if (DOUBLE_BRACE_RE.test(footer)) { w.push("Footer cannot contain variables ({{N}})"); DOUBLE_BRACE_RE.lastIndex = 0; }
  // CR-066 V20: Formatting markers in footer
  if (/[*_~`]/.test(footer)) w.push("Footer cannot contain formatting markers (*, _, ~, `)");
  return w;
}
const HEADER_TYPES = [
  { id: "none", label: "None", icon: null },
  { id: "text", label: "Text", icon: null },
  { id: "image", label: "Image", icon: Image },
  { id: "video", label: "Video", icon: Video },
  { id: "document", label: "Document", icon: FileText },
];
const BUTTON_TYPES = [
  { id: "QUICK_REPLY", label: "Quick Reply" },
  { id: "URL", label: "URL" },
  { id: "PHONE_NUMBER", label: "Call" },
];

const STATUS_STEPS = [
  { key: "draft", label: "Draft", num: 1 },
  { key: "submitted", label: "Submitted", num: 2 },
  { key: "pending", label: "Meta Review", num: 3 },
  { key: "approved", label: "Approved", num: 4 },
];

function charClass(len, max) {
  if (len > max) return "text-red-600 font-semibold";
  if (len > max * 0.9) return "text-amber-600";
  return "text-gray-400";
}

export default function TemplateBuilderPage() {
  const { api } = useAuth();
  const navigate = useNavigate();
  const { id: editId } = useParams();

  const [tpl, setTpl] = useState({
    template_name: "", category: "utility", language: "en",
    header_type: "none", header_content: "", media_url: "",
    header_handle: null, send_media_url: null, send_media_filename: null, header_media_mime: null,
    body: "", footer: "", buttons: [],
    body_examples: [], header_examples: [],
  });
  const [templateId, setTemplateId] = useState(null);
  const [metaTemplateId, setMetaTemplateId] = useState(null);
  const [status, setStatus] = useState("new");
  const [rejectReason, setRejectReason] = useState("");
  const [nameError, setNameError] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customTemplates, setCustomTemplates] = useState([]);
  const [metaErrors, setMetaErrors] = useState([]);
  const bodyRef = useRef(null);

  // CR-061 revised: Template Builder is accessible for ALL tenants (Add Template
  // button always visible). The allowlist only gates the CRM Templates drafts section
  // on TemplatesPage, not the builder itself. Backend 403 gates remain as safety net.

  // Load edit template
  useEffect(() => {
    if (editId) {
      api.get("/whatsapp/custom-templates").then(res => {
        const found = (res.data.templates || []).find(t => t.id === editId);
        if (found) {
          setTpl({
            template_name: found.template_name || "",
            category: found.category || "utility",
            language: found.language || "en",
            header_type: found.header_type || "none",
            header_content: found.header_content || "",
            media_url: found.media_url || "",
            header_handle: found.header_handle || null,
            send_media_url: found.send_media_url || null,
            send_media_filename: found.send_media_filename || null,
            header_media_mime: found.header_media_mime || null,
            body: found.body || "",
            footer: found.footer || "",
            buttons: found.buttons || [],
            body_examples: found.body_examples || [],
            header_examples: found.header_examples || [],
          });
          setTemplateId(found.id);
          setMetaTemplateId(found.meta_template_id || null);
          setStatus(found.status || "draft");
          setRejectReason(found.reject_reason || "");
        }
      }).catch(() => {});
    }
    fetchCustomTemplates();
  }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCustomTemplates = async () => {
    try {
      const res = await api.get("/whatsapp/custom-templates");
      setCustomTemplates(res.data.templates || []);
    } catch (_) {}
  };

  // Name validation
  const validateName = useCallback((name) => {
    if (!name) { setNameError(""); return; }
    if (name.startsWith("_")) { setNameError("Cannot start with an underscore"); return; }
    if (!NAME_REGEX.test(name)) { setNameError("Only lowercase letters, numbers, and underscores"); return; }
    if (name.length > LIMITS.name) { setNameError(`Max ${LIMITS.name} characters`); return; }
    setNameError("");
  }, []);

  // Duplicate check (debounced)
  useEffect(() => {
    if (!tpl.template_name || tpl.template_name.length < 3) { setDuplicateWarning(""); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/whatsapp/check-template-name?name=${encodeURIComponent(tpl.template_name)}`);
        if (res.data.exists) setDuplicateWarning(`"${res.data.clean_name}" already exists in your WABA`);
        else setDuplicateWarning("");
      } catch (_) { setDuplicateWarning(""); }
    }, 800);
    return () => clearTimeout(timer);
  }, [tpl.template_name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Status polling
  useEffect(() => {
    if (status !== "pending" || !templateId) return;
    const poll = setInterval(async () => {
      try {
        const res = await api.get(`/whatsapp/custom-templates/${templateId}/status`);
        if (res.data.status && res.data.status !== "pending") {
          setStatus(res.data.status);
          setRejectReason(res.data.reject_reason || "");
          if (res.data.status === "approved") toast.success("Template approved by Meta!");
          if (res.data.status === "rejected") toast.error(`Template rejected: ${res.data.reject_reason || "Unknown reason"}`);
          clearInterval(poll);
        }
      } catch (_) {}
    }, 30000);
    return () => clearInterval(poll);
  }, [status, templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Body variables
  const bodyVars = [...new Set((tpl.body.match(/\{\{\d+\}\}/g) || []))].sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));

  const updateField = (field, value) => {
    setTpl(p => ({ ...p, [field]: value }));
    if (field === "template_name") validateName(value);
    if (field === "body") setTpl(p => ({ ...p, body: value, body_examples: [] }));
  };

  // Feature A: Insert variable at cursor
  const insertBodyVariable = () => {
    const textarea = bodyRef.current;
    const cursorPos = textarea?.selectionStart ?? tpl.body.length;
    const maxN = Math.max(0, ...[...(tpl.body).matchAll(DOUBLE_BRACE_RE)].map(m => parseInt(m[1])));
    DOUBLE_BRACE_RE.lastIndex = 0;
    const varText = `{{${maxN + 1}}}`;
    const newBody = tpl.body.slice(0, cursorPos) + varText + tpl.body.slice(cursorPos);
    setTpl(p => ({ ...p, body: newBody, body_examples: [] }));
    setTimeout(() => {
      textarea?.focus();
      const newPos = cursorPos + varText.length;
      textarea?.setSelectionRange(newPos, newPos);
    }, 0);
  };

  // CR-062: wrap the current body selection with a Meta-supported formatting marker
  // (or insert paired markers at the caret when no selection is present).
  // Body-only — not applied to header or footer. Payload stays plain text.
  const wrapBodySelection = (marker) => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? tpl.body.length;
    const end = textarea.selectionEnd ?? start;
    const before = tpl.body.slice(0, start);
    const selected = tpl.body.slice(start, end);
    const after = tpl.body.slice(end);
    const newBody = `${before}${marker}${selected}${marker}${after}`;
    setTpl(p => ({ ...p, body: newBody }));
    // Restore focus and select the wrapped region (or place caret inside empty markers)
    setTimeout(() => {
      textarea.focus();
      const cursorStart = start + marker.length;
      const cursorEnd = cursorStart + selected.length;
      textarea.setSelectionRange(cursorStart, cursorEnd);
    }, 0);
  };

  const insertHeaderVariable = () => {
    if (tpl.header_content.includes("{{1}}")) return;
    const newContent = tpl.header_content + "{{1}}";
    setTpl(p => ({ ...p, header_content: newContent }));
  };

  // Buttons
  const addButton = () => {
    if (tpl.buttons.length >= 3) return;
    setTpl(p => ({ ...p, buttons: [...p.buttons, { type: "QUICK_REPLY", text: "", url_type: "static" }] }));
  };
  const removeButton = (idx) => {
    setTpl(p => ({ ...p, buttons: p.buttons.filter((_, i) => i !== idx) }));
  };
  const updateButton = (idx, field, value) => {
    setTpl(p => {
      const btns = [...p.buttons];
      btns[idx] = { ...btns[idx], [field]: value };
      // Auto-compose url for dynamic mode
      if (field === "url_type" && value === "dynamic") {
        btns[idx].url = (btns[idx].url_base || "") + "{{1}}";
      }
      if (field === "url_type" && value === "static") {
        btns[idx].url = btns[idx].url_base || btns[idx].url || "";
        btns[idx].url_base = "";
        btns[idx].url_example = "";
      }
      if (field === "url_base") {
        btns[idx].url = value + "{{1}}";
      }
      return { ...p, buttons: btns };
    });
  };

  // Save as Draft
  const handleSaveDraft = async () => {
    if (!tpl.template_name.trim() || !tpl.body.trim()) { toast.error("Template name and body are required"); return; }
    if (nameError) { toast.error(nameError); return; }
    setSaving(true);
    try {
      if (templateId && status === "draft") {
        await api.put(`/whatsapp/custom-templates/${templateId}`, tpl);
        toast.success("Template updated!");
      } else {
        const res = await api.post("/whatsapp/custom-templates", tpl);
        setTemplateId(res.data.id);
        toast.success("Template saved as draft!");
      }
      setStatus("draft");
      fetchCustomTemplates();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to save"); }
    finally { setSaving(false); }
  };

  // Submit to Meta
  const handleSubmitToMeta = async () => {
    if (!tpl.template_name.trim() || !tpl.body.trim()) { toast.error("Template name and body are required"); return; }
    if (nameError) { toast.error(nameError); return; }
    if (duplicateWarning) { toast.error(duplicateWarning); return; }

    // V1-V23 Meta compliance gate — BUG-015: errors block, warnings toast only
    const { valid, errors, warnings } = validateMetaCompliance(tpl);
    if (!valid) {
      toast.error(errors[0]);
      setMetaErrors(errors);
      return;
    }
    // BUG-015: show soft warnings as yellow toast (non-blocking)
    if (warnings.length > 0) {
      warnings.forEach(w => toast.warning(w));
    }
    setMetaErrors([]);

    const bvc = bodyVars.length;
    if (bvc > 0 && tpl.body_examples.filter(Boolean).length < bvc) {
      toast.error(`Provide example values for all ${bvc} body variables`); return;
    }
    setSubmitting(true);
    try {
      const res = await api.post("/whatsapp/create-and-sync-template", tpl);
      toast.success(res.data.message || "Template submitted to Meta!");
      const newId = res.data?.meta_result?.template?.id;
      if (newId) setTemplateId(newId);
      setMetaTemplateId(res.data?.meta_result?.meta_template_id || null);
      setStatus("pending");
      fetchCustomTemplates();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to submit to Meta");
    }
    finally { setSubmitting(false); }
  };

  // Status step
  const getStatusIdx = () => {
    if (status === "approved") return 4;
    if (status === "rejected") return 3;
    if (status === "pending") return 3;
    if (templateId) return 1;
    return 0;
  };
  const statusIdx = getStatusIdx();

  const statusPill = (s) => {
    const m = { draft: "bg-gray-100 text-gray-600", pending: "bg-amber-100 text-amber-700", approved: "bg-green-100 text-green-700", rejected: "bg-red-100 text-red-700", new: "bg-blue-50 text-blue-600" };
    return m[s] || m.draft;
  };

  return (
    <ResponsiveLayout>
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-4 lg:px-6 py-3 bg-white border-b border-gray-200 sticky top-0 z-20" data-testid="template-builder-topbar">
        <button onClick={() => navigate("/templates")} className="p-2 rounded-lg hover:bg-gray-100 transition" data-testid="builder-back-btn"><ArrowLeft className="w-5 h-5 text-gray-600" /></button>
        <h1 className="text-lg font-semibold text-gray-900">Template Builder</h1>
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold uppercase tracking-wide ${statusPill(status)}`} data-testid="builder-status-pill">{status}</span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => navigate("/templates")} data-testid="builder-cancel-btn">Cancel</Button>
          <Button variant="outline" onClick={handleSaveDraft} disabled={saving} data-testid="builder-save-draft-btn">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            {saving ? "Saving..." : "Save as Draft"}
          </Button>
          <Button onClick={handleSubmitToMeta} disabled={submitting || status === "approved"} className="bg-[#25D366] hover:bg-[#1da851] text-white" data-testid="builder-submit-meta-btn">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
            {submitting ? "Submitting..." : "Submit to Meta"}
          </Button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] min-h-[calc(100vh-120px)]">
        {/* LEFT — Form */}
        <div className="p-4 lg:p-6 space-y-4 overflow-y-auto" data-testid="builder-form-panel">

          {/* Basic Info */}
          <div className="bg-white rounded-xl border border-gray-200 p-5" data-testid="builder-basic-section">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Basic Info</p>
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium text-gray-700">Template Name</Label>
                <Input value={tpl.template_name} onChange={e => updateField("template_name", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                  placeholder="order_confirmation" className="mt-1 rounded-lg" data-testid="builder-name-input" />
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-gray-400">Only lowercase letters, numbers, underscores</span>
                  <span className={`text-xs ${charClass(tpl.template_name.length, LIMITS.name)}`}>{tpl.template_name.length} / {LIMITS.name}</span>
                </div>
                {nameError && <p className="text-xs text-red-600 mt-1" data-testid="builder-name-error">{nameError}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Category</Label>
                  <Select value={tpl.category} onValueChange={v => updateField("category", v)}>
                    <SelectTrigger className="mt-1 rounded-lg" data-testid="builder-category-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="utility">Utility</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="authentication">Authentication</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Language</Label>
                  <Select value={tpl.language} onValueChange={v => updateField("language", v)}>
                    <SelectTrigger className="mt-1 rounded-lg" data-testid="builder-language-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English (en)</SelectItem>
                      <SelectItem value="en_US">English US (en_US)</SelectItem>
                      <SelectItem value="hi">Hindi (hi)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Header */}
          <div className="bg-white rounded-xl border border-gray-200 p-5" data-testid="builder-header-section">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Header (optional)</p>
            <div className="flex gap-2 mb-3">
              {HEADER_TYPES.map(ht => (
                <button key={ht.id} type="button" onClick={() => { setTpl(p => ({ ...p, header_type: ht.id, header_content: "", header_examples: [], media_url: "", header_handle: null, send_media_url: null, send_media_filename: null, header_media_mime: null })); setMetaErrors([]); }}
                  className={`px-4 py-2 rounded-full text-xs font-semibold border transition-all ${tpl.header_type === ht.id ? "bg-[#F26B33] text-white border-[#F26B33]" : "bg-white text-gray-500 border-gray-200 hover:border-[#F26B33]"}`}
                  data-testid={`builder-header-${ht.id}`}>{ht.label}</button>
              ))}
            </div>
            {tpl.header_type === "text" && (
              <div>
                <div className="flex gap-2 items-center">
                  <Input value={tpl.header_content} onChange={e => updateField("header_content", e.target.value)}
                    placeholder="Header text with {{1}} variable..." className="rounded-lg flex-1" data-testid="builder-header-text-input" />
                  <button type="button" onClick={insertHeaderVariable} disabled={tpl.header_content.includes("{{1}}")}
                    className="px-2.5 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition whitespace-nowrap border border-gray-200"
                    data-testid="builder-header-add-var-btn">
                    <Plus className="w-3 h-3" /> {"{{1}}"}
                  </button>
                </div>
                <div className="flex justify-end mt-1"><span className={`text-xs ${charClass(tpl.header_content.length, LIMITS.header_text)}`}>{tpl.header_content.length} / {LIMITS.header_text}</span></div>
                {getHeaderWarnings(tpl.header_type, tpl.header_content).map((w, i) => (
                  <p key={i} className="text-xs text-red-600 mt-1 flex items-center gap-1" data-testid={`builder-header-warning-${i}`}>
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {w}
                  </p>
                ))}
                {tpl.header_content.includes("{{") && (
                  <Input value={tpl.header_examples[0] || ""} onChange={e => setTpl(p => ({ ...p, header_examples: [e.target.value] }))}
                    placeholder="Example value for header variable" className="rounded-lg mt-2 bg-blue-50 border-blue-200" data-testid="builder-header-example" />
                )}
              </div>
            )}
            {["image", "video", "document"].includes(tpl.header_type) && (
              <div>
                <Label className="text-sm font-medium text-gray-700">Header Media</Label>
                <div className="mt-1">
                  <MediaHeaderUpload
                    headerType={tpl.header_type}
                    currentHandle={tpl.header_handle}
                    currentSendMediaUrl={tpl.send_media_url}
                    currentFilename={tpl.send_media_filename}
                    onUploaded={({ handle, send_media_url, filename, mime }) => {
                      setTpl(p => ({
                        ...p,
                        header_handle: handle,
                        send_media_url,
                        send_media_filename: filename,
                        header_media_mime: mime,
                        media_url: send_media_url,
                      }));
                      setMetaErrors([]);
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Body */}
          <div className="bg-white rounded-xl border border-gray-200 p-5" data-testid="builder-body-section">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Body (required)</p>
            {/* CR-062: formatting toolbar — Meta-supported markers wrap the current selection */}
            <div className="flex items-center gap-1 mb-2" data-testid="builder-fmt-toolbar">
              <button type="button" onClick={() => wrapBodySelection("*")}
                title="Bold  (*text*)"
                className="w-8 h-8 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-sm font-bold text-gray-700 flex items-center justify-center transition"
                data-testid="fmt-bold-btn">B</button>
              <button type="button" onClick={() => wrapBodySelection("_")}
                title="Italic  (_text_)"
                className="w-8 h-8 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-sm italic text-gray-700 flex items-center justify-center transition"
                data-testid="fmt-italic-btn">I</button>
              <button type="button" onClick={() => wrapBodySelection("~")}
                title="Strikethrough  (~text~)"
                className="w-8 h-8 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-sm text-gray-700 line-through flex items-center justify-center transition"
                data-testid="fmt-strike-btn">S</button>
              <button type="button" onClick={() => wrapBodySelection("```")}
                title="Monospace  (```text```)"
                className="w-8 h-8 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-xs font-mono text-gray-700 flex items-center justify-center transition"
                data-testid="fmt-mono-btn">{"</>"}</button>
              <span className="ml-2 text-[11px] text-gray-400">Select text, then click to format. Uses WhatsApp markers.</span>
            </div>
            <textarea ref={bodyRef} value={tpl.body} onChange={e => updateField("body", e.target.value)}
              placeholder={"Hi {{1}},\nYour order {{2}} is confirmed.\nTotal: ₹{{3}}"}
              className="w-full min-h-[120px] rounded-lg border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#F26B33] focus:border-transparent resize-y bg-gray-50"
              data-testid="builder-body-textarea" />
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs text-gray-400">Use {"{{1}}"}, {"{{2}}"} for variables</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={insertBodyVariable} disabled={tpl.body.length >= LIMITS.body}
                  className="px-2.5 py-1 bg-[#F26B33] text-white text-xs font-semibold rounded-full hover:bg-[#d95a28] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition"
                  data-testid="builder-add-variable-btn">
                  <Plus className="w-3 h-3" /> Add Variable
                </button>
                <span className={`text-xs ${charClass(tpl.body.length, LIMITS.body)}`}>{tpl.body.length} / {LIMITS.body}</span>
              </div>
            </div>
            {getBodyWarnings(tpl.body).map((w, i) => (
              <p key={i} className="text-xs text-red-600 mt-1 flex items-center gap-1" data-testid={`builder-body-warning-${i}`}>
                <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {w}
              </p>
            ))}
            {bodyVars.length > 0 && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200" data-testid="builder-body-examples">
                <Label className="text-sm font-semibold text-blue-800">Example Values (Required by Meta)</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {bodyVars.map((v, i) => (
                    <div key={v}>
                      <Label className="text-xs text-blue-600">{v}</Label>
                      <Input value={tpl.body_examples[i] || ""} onChange={e => {
                        const ex = [...tpl.body_examples]; ex[i] = e.target.value;
                        setTpl(p => ({ ...p, body_examples: ex }));
                      }} placeholder={`Example for ${v}`} className="h-8 text-sm rounded bg-white border-blue-200" data-testid={`builder-body-example-${i}`} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-white rounded-xl border border-gray-200 p-5" data-testid="builder-footer-section">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Footer (optional)</p>
            <Input value={tpl.footer} onChange={e => updateField("footer", e.target.value)}
              placeholder="Reply STOP to unsubscribe" className="rounded-lg" data-testid="builder-footer-input" />
            <div className="flex justify-end mt-1"><span className={`text-xs ${charClass(tpl.footer.length, LIMITS.footer)}`}>{tpl.footer.length} / {LIMITS.footer}</span></div>
            {getFooterWarnings(tpl.footer).map((w, i) => (
              <p key={i} className="text-xs text-red-600 mt-1 flex items-center gap-1" data-testid={`builder-footer-warning-${i}`}>
                <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {w}
              </p>
            ))}
          </div>

          {/* Buttons */}
          <div className="bg-white rounded-xl border border-gray-200 p-5" data-testid="builder-buttons-section">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Buttons (optional, max 3)</p>
            {tpl.buttons.map((btn, idx) => (
              <div key={idx} className="flex gap-2 items-center mb-2 p-3 bg-gray-50 rounded-lg border border-gray-200" data-testid={`builder-button-row-${idx}`}>
                <Select value={btn.type} onValueChange={v => updateButton(idx, "type", v)}>
                  <SelectTrigger className="w-[130px] rounded-lg" data-testid={`builder-button-type-${idx}`}><SelectValue /></SelectTrigger>
                  <SelectContent>{BUTTON_TYPES.map(bt => <SelectItem key={bt.id} value={bt.id}>{bt.label}</SelectItem>)}</SelectContent>
                </Select>
                <div className="flex-1 relative">
                  <Input value={btn.text} onChange={e => updateButton(idx, "text", e.target.value)}
                    placeholder="Button text" maxLength={LIMITS.button_text} className="rounded-lg" data-testid={`builder-button-text-${idx}`} />
                  <span className={`absolute right-2 top-2.5 text-xs ${charClass((btn.text || "").length, LIMITS.button_text)}`}>{(btn.text || "").length}/{LIMITS.button_text}</span>
                </div>
                {btn.type === "URL" && (
                  <div className="flex-1 flex flex-col gap-1.5">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="radio" name={`url_type_${idx}`} value="static" checked={(btn.url_type || "static") === "static"}
                          onChange={() => updateButton(idx, "url_type", "static")} className="accent-[#F26B33]" />
                        <span className="text-xs text-gray-600">Static</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="radio" name={`url_type_${idx}`} value="dynamic" checked={btn.url_type === "dynamic"}
                          onChange={() => updateButton(idx, "url_type", "dynamic")} className="accent-[#F26B33]" />
                        <span className="text-xs text-gray-600 flex items-center gap-1"><Link2 className="w-3 h-3" /> Dynamic</span>
                      </label>
                    </div>
                    {(btn.url_type || "static") === "static" ? (
                      <Input value={btn.url || ""} onChange={e => updateButton(idx, "url", e.target.value)}
                        placeholder="https://example.com/page" className="rounded-lg" data-testid={`builder-button-url-${idx}`} />
                    ) : (
                      <div className="space-y-1.5">
                        <div>
                          <Label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Base URL</Label>
                          <div className="flex items-center gap-0 mt-0.5">
                            <Input value={btn.url_base || ""} onChange={e => updateButton(idx, "url_base", e.target.value)}
                              placeholder="Enter base URL, e.g. https://crm.mygenie.online/api/invoices/" className="rounded-l-lg rounded-r-none flex-1 border-r-0 text-sm" data-testid={`builder-button-url-base-${idx}`} />
                            <span className="px-2.5 py-1.5 bg-[#F26B33]/10 text-[#F26B33] text-xs font-bold border border-[#F26B33]/30 rounded-r-lg whitespace-nowrap" data-testid={`builder-button-url-var-${idx}`}>{"{{1}}"}</span>
                          </div>
                        </div>
                        <div>
                          <Label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Sample URL (required by Meta)</Label>
                          <Input value={btn.url_example || ""} onChange={e => updateButton(idx, "url_example", e.target.value)}
                            placeholder="https://crm.mygenie.online/api/invoices/abc123token" className="rounded-lg bg-blue-50 border-blue-200 text-sm mt-0.5" data-testid={`builder-button-url-example-${idx}`} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {btn.type === "PHONE_NUMBER" && (
                  <Input value={btn.phone_number || ""} onChange={e => updateButton(idx, "phone_number", e.target.value)}
                    placeholder="+91..." className="flex-1 rounded-lg" data-testid={`builder-button-phone-${idx}`} />
                )}
                <button onClick={() => removeButton(idx)} className="text-red-500 hover:text-red-700 p-1" data-testid={`builder-button-remove-${idx}`}><X className="w-4 h-4" /></button>
              </div>
            ))}
            {tpl.buttons.length < 3 && (
              <button onClick={addButton} className="text-sm text-[#F26B33] font-semibold flex items-center gap-1 mt-2 hover:underline" data-testid="builder-add-button-btn">
                <Plus className="w-4 h-4" /> Add Button
                <span className="text-xs text-gray-400 ml-2">{3 - tpl.buttons.length} more allowed</span>
              </button>
            )}
          </div>

          {/* Meta Validation Errors */}
          {metaErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4" data-testid="builder-meta-errors">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Meta Validation Failed</p>
                  <ul className="mt-2 space-y-1">
                    {metaErrors.map((err, i) => (
                      <li key={i} className="text-xs text-red-700 flex items-start gap-1.5">
                        <span className="text-red-400 mt-0.5">-</span> {err}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Duplicate Warning */}
          {duplicateWarning && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3" data-testid="builder-duplicate-warning">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Duplicate Name</p>
                <p className="text-xs text-amber-700 mt-1">{duplicateWarning}. Choose a different name.</p>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — Preview + Status */}
        <div className="border-l border-gray-200 bg-[#075e54] flex flex-col" data-testid="builder-preview-panel">
          <div className="px-5 py-3 text-white text-sm font-semibold border-b border-white/10">WhatsApp Preview</div>
          <div className="flex-1 p-5 overflow-y-auto" style={{ background: "#e5ddd5" }}>
            <div className="bg-[#dcf8c6] rounded-xl p-3 max-w-[320px] mx-auto shadow-sm" data-testid="builder-wa-preview">
              {tpl.header_type === "text" && tpl.header_content && <p className="text-sm font-bold text-gray-900 mb-1">{tpl.header_content}</p>}
              {["image", "video", "document"].includes(tpl.header_type) && tpl.media_url && (
                <div className="w-full h-[140px] bg-green-100 rounded-lg mb-2 flex items-center justify-center text-green-700 text-xs font-semibold">
                  [{tpl.header_type}: {tpl.media_url.split("/").pop() || "media"}]
                </div>
              )}
              {tpl.body ? (
                (() => {
                  // CR-062: preview renderer — variable examples first, then WhatsApp formatting markers
                  const escapeHtml = (s) => String(s)
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
                  // Split by {{n}} placeholders and rebuild with escaped literal text + escaped example values
                  const parts = String(tpl.body).split(/(\{\{\d+\}\})/g);
                  let stitched = "";
                  for (const seg of parts) {
                    const m = seg.match(/^\{\{(\d+)\}\}$/);
                    if (m) {
                      const ex = tpl.body_examples[parseInt(m[1]) - 1];
                      stitched += ex
                        ? `<strong class="text-gray-900">${escapeHtml(ex)}</strong>`
                        : escapeHtml(seg);
                    } else {
                      stitched += escapeHtml(seg);
                    }
                  }
                  // Apply WhatsApp markers AFTER variable substitution and HTML escape.
                  // Order matters: monospace (```) before single-char markers to avoid conflicts.
                  let html = stitched
                    .replace(/```([\s\S]+?)```/g, '<code class="bg-gray-100 px-1 rounded text-[13px] font-mono">$1</code>')
                    .replace(/(^|[\s>])\*([^\s*][^*\n]*?)\*(?=[\s<]|$)/g, '$1<b>$2</b>')
                    .replace(/(^|[\s>])_([^\s_][^_\n]*?)_(?=[\s<]|$)/g, '$1<i>$2</i>')
                    .replace(/(^|[\s>])~([^\s~][^~\n]*?)~(?=[\s<]|$)/g, '$1<s>$2</s>');
                  // CR-066 BUG-QA-01 fix: after italic pairs are rendered above, any remaining
                  // _ is orphan. Match _ preceded by start/whitespace/punctuation regardless
                  // of what follows (removed over-restrictive lookahead).
                  html = html.replace(/((?:^|[\s;,!?.>]))(_)/gm, '$1<span class="text-red-500 bg-red-100 px-0.5 rounded font-semibold" title="Orphan italic marker">_</span>');
                  return (
                    <p
                      className="text-sm text-gray-900 whitespace-pre-wrap"
                      data-testid="builder-preview-body"
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  );
                })()
              ) : <p className="text-sm text-gray-400 italic">Type your message body...</p>}
              {tpl.footer && <p className="text-xs text-gray-500 mt-2 border-t border-gray-200 pt-1">{tpl.footer}</p>}
              <p className="text-[10px] text-gray-400 text-right mt-1">11:42 AM ✓✓</p>
              {tpl.buttons.length > 0 && (
                <div className="mt-1 border-t border-gray-200">
                  {tpl.buttons.map((btn, i) => (
                    <div key={i} className="text-center py-2 text-[#00a5f4] text-sm font-medium border-b border-gray-100 last:border-b-0">
                      {btn.text || "Button"} {btn.type === "URL" && "↗"}
                      {btn.type === "URL" && btn.url_type === "dynamic" && <span className="ml-1 text-[8px] text-gray-400 align-middle">dynamic</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Status Tracker */}
          <div className="bg-white p-4 border-t border-gray-200" data-testid="builder-status-tracker">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Template Status</p>
            <div className="flex gap-0">
              {STATUS_STEPS.map((step, i) => {
                const isDone = (status === "approved" && i < 4) || (status === "rejected" && i < 3) || (status === "pending" && i < 3) || (statusIdx > 0 && i < statusIdx);
                const isActive = (status === "pending" && i === 2) || (status === "approved" && i === 3) || (status === "rejected" && i === 2);
                const isRejected = status === "rejected" && i === 2;
                return (
                  <div key={step.key} className="flex-1 text-center relative">
                    <div className={`w-6 h-6 mx-auto rounded-full flex items-center justify-center text-xs font-bold
                      ${isRejected ? "bg-red-500 text-white" : isDone ? "bg-[#25D366] text-white" : isActive ? "bg-[#F26B33] text-white" : "bg-gray-200 text-gray-400"}`}>
                      {isDone && !isActive ? <CheckCircle className="w-3.5 h-3.5" /> : isRejected ? <XCircle className="w-3.5 h-3.5" /> : step.num}
                    </div>
                    <p className="text-[10px] mt-1 text-gray-500">{status === "rejected" && i === 3 ? "Rejected" : step.label}</p>
                  </div>
                );
              })}
            </div>
            {status === "pending" && <p className="text-center text-xs text-amber-600 mt-2 flex items-center justify-center gap-1"><Clock className="w-3 h-3" /> Pending Meta review...</p>}
            {status === "rejected" && rejectReason && <p className="text-center text-xs text-red-600 mt-2">{rejectReason}</p>}
          </div>

          {/* Template List */}
          <div className="bg-gray-50 border-t border-gray-200 p-4 max-h-[200px] overflow-y-auto" data-testid="builder-template-list">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Your Templates</p>
            {customTemplates.length === 0 && <p className="text-xs text-gray-400">No templates yet</p>}
            {customTemplates.map(ct => (
              <div key={ct.id} className="bg-white rounded-lg border border-gray-200 p-3 mb-2 flex items-center gap-3 cursor-pointer hover:border-[#F26B33] transition"
                onClick={() => { if (ct.id !== editId) navigate(`/template-builder/${ct.id}`); }} data-testid={`builder-tpl-card-${ct.id}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{ct.template_name}</p>
                  <p className="text-xs text-gray-400">{ct.category} · {ct.language === "en_US" || ct.language === "en" ? "English" : "Hindi"}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusPill(ct.status)}`}>{ct.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ResponsiveLayout>
  );
}
