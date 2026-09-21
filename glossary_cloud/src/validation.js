/** Validate and normalize the shared glossary without accepting arbitrary fields. */
export function validateGlossary(value) {
  const text = (s, max = 500) => {
    if (typeof s !== "string" || !s.trim() || [...s.trim()].length > max) throw new Error("名稱或譯名不能空白，且不能超過字數限制");
    return s.trim();
  };
  const mapping = (m) => {
    if (!m || !Array.isArray(m.jp) || !m.jp.length) throw new Error("請填入日文別名");
    const result = { jp: [...new Set(m.jp.map(a => text(a)))], zh: text(m.zh) };
    if (m.note) result["note"] = text(m.note, 1000);
    if (m.disabled === true) result["disabled"] = true;
    return result;
  };
  if (!value || !Array.isArray(value.talents) || !Array.isArray(value.others)) throw new Error("詞庫必須包含 talents 和 others");
  if (value.talents.length + value.others.length > 10000) throw new Error("詞庫項目過多");
  return {
    talents: value.talents.map(u => {
      if (!u || !Array.isArray(u.members) || !u.members.length) throw new Error("每組至少需要一位成員");
      const result = { group: u.group ? mapping(u.group) : null, members: u.members.map(mapping) };
      if (u.disabled === true) result["disabled"] = true;
      return result;
    }),
    others: value.others.map(mapping),
  };
}

/** Use immutable GitHub numeric IDs rather than reusable account names. */
export function isAllowed(id, allowlist) {
  return String(allowlist || "").split(",").map(x => x.trim()).filter(Boolean).includes(String(id));
}
