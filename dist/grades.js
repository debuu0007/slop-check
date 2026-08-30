export function gradeFor(score) {
    if (score <= 9)
        return { grade: "A", label: "Shipped by a human. Probably.", color: "#22c55e" };
    if (score <= 24)
        return { grade: "B", label: "Some assembly required.", color: "#84cc16" };
    if (score <= 44)
        return { grade: "C", label: "The code is doing its best.", color: "#eab308" };
    if (score <= 69)
        return { grade: "D", label: "This code is apologizing to you.", color: "#f97316" };
    return { grade: "F", label: "// TODO: write the actual product", color: "#ef4444" };
}
//# sourceMappingURL=grades.js.map