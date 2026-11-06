import * as ts from "typescript";

/**
 * JSX의 className을 읽은 결과.
 * - always: 항상 붙는 클래스(문자열 리터럴, 템플릿의 고정 부분, cn()/clsx() 인자의 문자열)
 * - conditional: 조건이 붙은 클래스(`cond && "x"`, `a ? "x" : "y"`, `{ x: cond }`의 키). 붙을 수도 안 붙을 수도 있다
 * - dynamic: 읽지 못한 부분이 있다(변수, 함수 호출 결과, `${}` 안의 값, 전개 `...`, `styles.x`)
 * 판정하는 쪽은 "없다"를 확정하려면 dynamic이 false이고 conditional에도 없을 때만 한다. 아니면 확인 필요로 보낸다.
 */
export type ClassInfo = { always: string[]; conditional: string[]; dynamic: boolean };

/** 클래스를 합치는 도우미 함수 이름. 새 도우미는 여기에 추가한다 */
export const CLASS_HELPERS = new Set(["cn", "clsx", "classnames", "classNames", "cx", "twMerge", "twJoin"]);

const HOLE = "\u0000";

function addTokens(info: ClassInfo, text: string, conditional: boolean) {
  const target = conditional ? info.conditional : info.always;
  for (const t of text.split(/\s+/)) {
    if (!t) continue;
    // `p-${n}`처럼 값이 붙은 조각은 클래스 이름이 아니므로 버리고 dynamic으로만 남긴다
    if (t.includes(HOLE)) info.dynamic = true;
    else target.push(t);
  }
}

function read(expr: ts.Expression, info: ClassInfo, conditional: boolean) {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return addTokens(info, expr.text, conditional);
  if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isNonNullExpression(expr) || ts.isSatisfiesExpression(expr)) return read(expr.expression, info, conditional);
  if (ts.isTemplateExpression(expr)) {
    info.dynamic = true;
    return addTokens(info, expr.head.text + expr.templateSpans.map((s) => HOLE + s.literal.text).join(""), conditional);
  }
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return read(expr.right, info, true); // 왼쪽은 조건식
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      read(expr.left, info, true);
      return read(expr.right, info, true);
    }
  }
  if (ts.isConditionalExpression(expr)) {
    read(expr.whenTrue, info, true);
    return read(expr.whenFalse, info, true);
  }
  if (ts.isArrayLiteralExpression(expr)) {
    for (const e of expr.elements) {
      if (ts.isSpreadElement(e)) info.dynamic = true;
      else read(e, info, conditional);
    }
    return;
  }
  if (ts.isObjectLiteralExpression(expr)) {
    for (const p of expr.properties) {
      const key = (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && !ts.isComputedPropertyName(p.name) ? p.name : null;
      if (key && (ts.isIdentifier(key) || ts.isStringLiteral(key))) addTokens(info, key.text, true);
      else info.dynamic = true;
    }
    return;
  }
  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && CLASS_HELPERS.has(expr.expression.text)) {
    for (const a of expr.arguments) {
      if (ts.isSpreadElement(a)) info.dynamic = true;
      else read(a, info, conditional);
    }
    return;
  }
  info.dynamic = true;
}

/** `className="…"`·`className={…}` 속성의 값 */
export function readClassName(attr: ts.JsxAttribute): ClassInfo {
  const info: ClassInfo = { always: [], conditional: [], dynamic: false };
  const init = attr.initializer;
  if (!init) return info;
  if (ts.isStringLiteral(init)) addTokens(info, init.text, false);
  else if (ts.isJsxExpression(init) && init.expression) read(init.expression, info, false);
  return info;
}
