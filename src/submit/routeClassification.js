const AUTO_ROUTE_LABELS = new Set(["reading", "listening", "speaking"]);

export function routeClassification(classification, { minConfidence = 0.75 } = {}) {
  if (
    AUTO_ROUTE_LABELS.has(classification.primary_label) &&
    classification.confidence >= minConfidence &&
    !classification.should_route_to_review
  ) {
    return classification.primary_label;
  }

  return "review";
}
