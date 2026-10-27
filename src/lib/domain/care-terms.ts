import type { CareTerm, CaregiverRelationship } from "./types";

/** The "Who are you caring for?" choices and the voice they set. */
export const CARE_TERMS: { term: CareTerm; label: string; relationship: CaregiverRelationship; sex?: "F" | "M"; them: string; their: string }[] = [
  { term: "mother", label: "My mother", relationship: "child", sex: "F", them: "your mom", their: "your mom's" },
  { term: "father", label: "My father", relationship: "child", sex: "M", them: "your dad", their: "your dad's" },
  { term: "wife", label: "My wife", relationship: "spouse", sex: "F", them: "your wife", their: "your wife's" },
  { term: "husband", label: "My husband", relationship: "spouse", sex: "M", them: "your husband", their: "your husband's" },
  { term: "parent_in_law", label: "My mother- or father-in-law", relationship: "daughter_in_law", them: "your in-law", their: "your in-law's" },
  { term: "sibling", label: "My sister or brother", relationship: "sibling", them: "your sibling", their: "your sibling's" },
  { term: "grandparent", label: "My grandmother or grandfather", relationship: "grandchild", them: "your grandparent", their: "your grandparent's" },
  { term: "friend", label: "A friend or neighbor", relationship: "friend_neighbor", them: "your friend", their: "your friend's" },
  { term: "other", label: "Someone else in my family", relationship: "other", them: "them", their: "their" },
];

export function careTerm(term?: CareTerm) {
  return CARE_TERMS.find((t) => t.term === term) ?? CARE_TERMS[CARE_TERMS.length - 1];
}

/** "your mom" when we know the term, otherwise the first name, otherwise "the person you care for". */
export function voice(term?: CareTerm, firstName?: string): { them: string; their: string; Them: string } {
  const t = term ? careTerm(term) : undefined;
  const them = t && t.term !== "other" ? t.them : firstName || "the person you care for";
  const their = t && t.term !== "other" ? t.their : firstName ? `${firstName}'s` : "their";
  return { them, their, Them: them.charAt(0).toUpperCase() + them.slice(1) };
}
