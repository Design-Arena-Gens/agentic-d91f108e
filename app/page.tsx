"use client";

import { useCallback, useMemo, useRef, useState } from "react";

type Strategy = {
  id: StrategyId;
  label: string;
  description: string;
};

type StrategyId =
  | "smart"
  | "base64"
  | "rot13"
  | "caesar"
  | "hex"
  | "binary"
  | "url"
  | "reverse";

type DecodeResult = {
  id: StrategyId;
  title: string;
  subtitle: string;
  output: string;
  confidence: number;
  corrections?: string[];
};

const STRATEGIES: Strategy[] = [
  {
    id: "smart",
    label: "التحليل الذكي",
    description: "كشف النمط الأنسب تلقائياً مع تصحيح الأخطاء المقترحة."
  },
  {
    id: "base64",
    label: "Base64",
    description: "فك التشفير القياسي للنصوص المرمزة بصيغة Base64."
  },
  {
    id: "rot13",
    label: "ROT13",
    description: "تحويل ROT13 الشائع في تشفير الرسائل السريعة."
  },
  {
    id: "caesar",
    label: "قيصر الذكي",
    description: "يجرب 25 إزاحة للعثور على أفضل نتيجة لتشفير قيصر."
  },
  {
    id: "hex",
    label: "HEX",
    description: "تحويل من تمثيل سداسي عشري إلى نص قابل للقراءة."
  },
  {
    id: "binary",
    label: "Binary",
    description: "ترجمة سلاسل البتات (0/1) إلى نص."
  },
  {
    id: "url",
    label: "URL",
    description: "إلغاء ترميز سلاسل URL واستعادة الحروف الأصلية."
  },
  {
    id: "reverse",
    label: "عكس النص",
    description: "يقلب ترتيب المحارف لإصلاح الترتيب المعكوس."
  }
];

const CORRECTIONS: Record<string, string> = {
  "صطناعي": "اصطناعي",
  "دكاء": "ذكاء",
  "الذكاء الاصطناعى": "الذكاء الاصطناعي",
  "تعلم الاله": "تعلم الآلة",
  "ملف مشفر": "ملف مُشفَّر",
  "تشفر": "تشفير",
  teh: "the",
  adress: "address",
  recieve: "receive",
  seperate: "separate"
};

const arabicStopList = new Set([
  "ال",
  "من",
  "على",
  "الى",
  "عن",
  "في",
  "هو",
  "هي",
  "مع",
  "هذا",
  "هذه",
  "ذلك"
]);

const toUtf8 = (input: string) => {
  try {
    return decodeURIComponent(escape(input));
  } catch {
    return input;
  }
};

const safeAtob = (value: string) => {
  try {
    if (typeof globalThis.atob === "function") {
      return globalThis.atob(value);
    }
  } catch {
    // continue to fallback
  }

  if (typeof globalThis.Buffer !== "undefined") {
    return globalThis.Buffer.from(value, "base64").toString("binary");
  }

  throw new Error("Base64 decoding unsupported in this environment.");
};

const base64Pattern =
  /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}(==)?|[A-Za-z0-9+/]{3}=)?$/;

const isLikelyBinary = (value: string) =>
  /^[01\s]+$/.test(value) && value.replace(/\s+/g, "").length % 8 === 0;

const isLikelyHex = (value: string) =>
  /^([0-9a-fA-F]{2}\s*)+$/.test(value.trim());

const rot13 = (value: string) =>
  value.replace(/[a-zA-Z]/g, (char) => {
    const base = char <= "Z" ? 65 : 97;
    return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base);
  });

const scoreReadable = (input: string) => {
  if (!input.trim()) return 0;
  const printable = input.replace(/[\x00-\x1f\x7f]/g, "");
  const ratio = printable.length / input.length;

  const vowels = input.match(/[aeiouAEIOUاأإآءؤيى]/g)?.length ?? 0;
  const words = input.trim().split(/\s+/);
  const stopMatches = words.reduce((count, word) => {
    if (arabicStopList.has(word.replace(/[^\p{L}]/gu, ""))) return count + 1;
    return count;
  }, 0);

  const wordRatio = Math.min(stopMatches / (words.length || 1), 0.5);
  const vowelRatio = vowels / (input.length || 1);

  return Math.max(
    0,
    Math.min(1, 0.45 * ratio + 0.35 * vowelRatio + 0.35 * wordRatio)
  );
};

const autoCorrect = (input: string) => {
  const corrections: string[] = [];
  let corrected = input;

  Object.entries(CORRECTIONS).forEach(([wrong, right]) => {
    if (corrected.includes(wrong)) {
      corrected = corrected.replace(new RegExp(wrong, "g"), right);
      corrections.push(`تم استبدال "${wrong}" بـ "${right}"`);
    }
  });

  return { corrected, corrections };
};

const runDecoders = (value: string, active: StrategyId[]): DecodeResult[] => {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const results: DecodeResult[] = [];

  const pushResult = (result: DecodeResult | null) => {
    if (!result) return;
    const existing = results.find((item) => item.id === result.id);
    if (existing) return;
    results.push(result);
  };

  const considerCorrection = (text: string, base: DecodeResult) => {
    const { corrected, corrections } = autoCorrect(text);
    if (corrections.length) {
      pushResult({
        ...base,
        id: base.id === "smart" ? base.id : (base.id + "-corrected") as StrategyId,
        title: `${base.title} + تصحيح`,
        subtitle: corrections.join(" • "),
        output: corrected,
        confidence: Math.min(base.confidence + 0.1, 0.98),
        corrections
      });
    }
  };

  const applyBase64 = () => {
    if (!base64Pattern.test(trimmed.replace(/\s+/g, ""))) return null;
    try {
      const raw = safeAtob(trimmed.replace(/\s+/g, ""));
      const output = toUtf8(raw);
      if (!output.trim()) return null;
      return {
        id: "base64" as const,
        title: "نتيجة Base64",
        subtitle: "تم فك ترميز السلسلة بنجاح بصيغة Base64.",
        output,
        confidence: scoreReadable(output)
      };
    } catch {
      return null;
    }
  };

  const applyRot13 = () => {
    const output = rot13(trimmed);
    if (output === trimmed) return null;
    return {
      id: "rot13" as const,
      title: "نتيجة ROT13",
      subtitle: "تم تدوير الحروف 13 خانة لاستعادة النص الأصلي.",
      output,
      confidence: scoreReadable(output)
    };
  };

  const applyCaesar = () => {
    let bestScore = 0;
    let bestShift = 0;
    let bestOutput = trimmed;

    for (let shift = 1; shift < 26; shift++) {
      const output = trimmed.replace(/[a-zA-Z]/g, (char) => {
        const base = char <= "Z" ? 65 : 97;
        return String.fromCharCode(
          ((char.charCodeAt(0) - base + shift) % 26) + base
        );
      });
      const score = scoreReadable(output);
      if (score > bestScore) {
        bestScore = score;
        bestShift = shift;
        bestOutput = output;
      }
    }

    if (bestScore < 0.35) return null;

    return {
      id: "caesar" as const,
      title: `إزاحة قيصر ${bestShift}`,
      subtitle: `أفضل تطابق بعد تجربة 25 احتمالاً لإزاحة قيصر.`,
      output: bestOutput,
      confidence: bestScore
    };
  };

  const applyHex = () => {
    if (!isLikelyHex(trimmed)) return null;
    try {
      const bytes = trimmed
        .replace(/\s+/g, "")
        .match(/.{1,2}/g)
        ?.map((piece) => parseInt(piece, 16));
      if (!bytes?.length) return null;
      const output = new TextDecoder().decode(new Uint8Array(bytes));
      return {
        id: "hex" as const,
        title: "فك ترميز HEX",
        subtitle: "تم تحويل السلسلة السداسية إلى UTF-8.",
        output,
        confidence: scoreReadable(output)
      };
    } catch {
      return null;
    }
  };

  const applyBinary = () => {
    if (!isLikelyBinary(trimmed)) return null;
    try {
      const chars = trimmed
        .match(/[01]{8}/g)
        ?.map((byte) => String.fromCharCode(parseInt(byte, 2)))
        .join("");
      if (!chars) return null;
      const output = toUtf8(chars);
      return {
        id: "binary" as const,
        title: "تحويل ثنائي",
        subtitle: "تم تحويل البتات إلى نص قابل للقراءة.",
        output,
        confidence: scoreReadable(output)
      };
    } catch {
      return null;
    }
  };

  const applyUrl = () => {
    try {
      const decoded = decodeURIComponent(trimmed.replace(/\+/g, " "));
      if (decoded === trimmed) return null;
      return {
        id: "url" as const,
        title: "إلغاء ترميز URL",
        subtitle: "تمت إزالة ترميز URI وإرجاع النص الأصلي.",
        output: decoded,
        confidence: scoreReadable(decoded)
      };
    } catch {
      return null;
    }
  };

  const applyReverse = () => {
    const reversed = trimmed.split("").reverse().join("");
    if (reversed === trimmed) return null;
    return {
      id: "reverse" as const,
      title: "عكس الترتيب",
      subtitle: "تم قلب ترتيب المحارف لمعالجة الملفات المقلوبة.",
      output: reversed,
      confidence: scoreReadable(reversed)
    };
  };

  const base64Result = applyBase64();
  const rotResult = applyRot13();
  const caesarResult = applyCaesar();
  const hexResult = applyHex();
  const binaryResult = applyBinary();
  const urlResult = applyUrl();
  const reverseResult = applyReverse();

  const smartConfidence: Array<{ result: DecodeResult; weight: number }> = [];

  const consider = (
    id: StrategyId,
    result: DecodeResult | null,
    weight = 1
  ) => {
    if (!result || !active.includes(id)) return;
    pushResult(result);
    considerCorrection(result.output, result);

    if (active.includes("smart")) {
      smartConfidence.push({ result, weight });
    }
  };

  consider("base64", base64Result, 1.2);
  consider("rot13", rotResult, 0.8);
  consider("caesar", caesarResult, 1.1);
  consider("hex", hexResult, 1.2);
  consider("binary", binaryResult, 1);
  consider("url", urlResult, 0.9);
  consider("reverse", reverseResult, 0.6);

  if (active.includes("smart")) {
    const sorted = smartConfidence
      .map((entry) => ({
        ...entry,
        score: entry.result.confidence * entry.weight
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    sorted.forEach((entry, index) => {
      pushResult({
        ...entry.result,
        id: ("smart" + index) as StrategyId,
        title: `التحليل الذكي (${entry.result.title})`,
        subtitle: entry.result.subtitle,
        confidence: Math.min(entry.result.confidence * 1.1, 0.99)
      });
    });
  }

  if (results.length === 0) {
    const baseResult: DecodeResult = {
      id: "smart",
      title: "لم يتم العثور على نمط واضح",
      subtitle:
        "جرّب تنسيقات أخرى أو أدخل نصوصاً تحتوي على مؤشرات أكثر لفك التشفير.",
      output: trimmed,
      confidence: 0.1
    };
    pushResult(baseResult);
    considerCorrection(trimmed, baseResult);
  }

  return results.sort((a, b) => b.confidence - a.confidence);
};

const STRATEGY_ORDER: StrategyId[] = STRATEGIES.map((strategy) => strategy.id);

const Page = () => {
  const [input, setInput] = useState("");
  const [activeStrategies, setActiveStrategies] = useState<StrategyId[]>([
    "smart",
    "base64",
    "rot13",
    "hex"
  ]);
  const [results, setResults] = useState<DecodeResult[]>([]);
  const [isDecoding, setIsDecoding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const activateAll = useCallback(() => {
    setActiveStrategies(STRATEGY_ORDER);
  }, []);

  const toggleStrategy = useCallback((id: StrategyId) => {
    setActiveStrategies((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id].sort(
            (a, b) => STRATEGY_ORDER.indexOf(a) - STRATEGY_ORDER.indexOf(b)
          )
    );
  }, []);

  const handleDecode = useCallback(() => {
    if (!input.trim()) {
      setResults([]);
      return;
    }
    setIsDecoding(true);
    setTimeout(() => {
      const next = runDecoders(input, activeStrategies);
      setResults(next);
      setIsDecoding(false);
    }, 140);
  }, [input, activeStrategies]);

  const stats = useMemo(() => {
    const length = input.length;
    const lines = input.split("\n").length;
    const words = input.trim() ? input.trim().split(/\s+/).length : 0;
    const selected = activeStrategies.length;
    return { length, lines, words, selected };
  }, [input, activeStrategies]);

  const bestConfidence = results[0]?.confidence ?? 0;

  const handleDrop = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (!event.dataTransfer.files.length) return;
    const file = event.dataTransfer.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setInput(text);
    };
    reader.readAsText(file);
  }, []);

  const handleFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        setInput(text);
      };
      reader.readAsText(file);
    },
    []
  );

  return (
    <main>
      <section className="card grid" style={{ gap: 24 }}>
        <header>
          <span className="badge">منصة ذكاء اصطناعي عربية</span>
          <h1 style={{ margin: "16px 0 8px", fontSize: "2.4rem" }}>
            Deka AI
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: "620px",
              lineHeight: 1.8,
              color: "rgba(203, 213, 225, 0.88)"
            }}
          >
            ارفع ملفاً أو الصق نصاً مشفراً وسيتولى النظام اكتشاف النمط الأنسب
            لفك التشفير مع اقتراح تصحيحات لغوية ذكية تلقائياً. يدعم النظام
            صيغاً مثل Base64 وHEX وROT13 بالإضافة إلى كشف الأخطاء الإملائية
            الشائعة في العربية والإنجليزية.
          </p>
        </header>

        <label
          className="file-drop"
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={handleDrop}
          htmlFor="file-input"
        >
          اسحب ملف نصي هنا أو انقر لاختياره
          <input
            ref={fileRef}
            id="file-input"
            className="file-input"
            type="file"
            accept=".txt,.json,.csv,.log,.md,.ini,.env"
            onChange={handleFile}
          />
        </label>

        <div>
          <textarea
            className="textarea"
            placeholder="ألصق النص أو محتوى الملف هنا..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <div className="pill-group">
            {STRATEGIES.map((strategy) => (
              <button
                key={strategy.id}
                type="button"
                className={`pill${
                  activeStrategies.includes(strategy.id) ? " active" : ""
                }`}
                onClick={() => toggleStrategy(strategy.id)}
                title={strategy.description}
              >
                {strategy.label}
              </button>
            ))}
          </div>
          {activeStrategies.length !== STRATEGY_ORDER.length && (
            <button
              type="button"
              className="pill"
              style={{ marginTop: "12px" }}
              onClick={activateAll}
            >
              تفعيل كل الخوارزميات
            </button>
          )}
          <button
            className="primary-btn"
            type="button"
            onClick={handleDecode}
            disabled={isDecoding}
          >
            {isDecoding ? "جارٍ التحليل..." : "ابدأ فك التشفير"}
          </button>
        </div>

        <section className="stats-grid">
          <article className="stat-card">
            <div className="stat-label">عدد المحارف</div>
            <div className="stat-value">{stats.length}</div>
          </article>
          <article className="stat-card">
            <div className="stat-label">عدد الأسطر</div>
            <div className="stat-value">{stats.lines}</div>
          </article>
          <article className="stat-card">
            <div className="stat-label">عدد الكلمات</div>
            <div className="stat-value">{stats.words}</div>
          </article>
          <article className="stat-card">
            <div className="stat-label">الخوارزميات الفعالة</div>
            <div className="stat-value">{stats.selected}</div>
          </article>
        </section>
      </section>

      <section className="results" style={{ marginTop: "32px" }}>
        {results.length > 0 ? (
          results.map((result, index) => (
            <article key={`${result.id}-${index}`} className="result-card">
              <div className="result-header">
                <div>
                  <div className="result-title">{result.title}</div>
                  <div className="result-subtitle">{result.subtitle}</div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: "rgba(56, 189, 248, 0.9)"
                  }}
                >
                  <span style={{ fontSize: "0.85rem" }}>دقة تقديرية</span>
                  <strong style={{ fontSize: "1.2rem" }}>
                    {(result.confidence * 100).toFixed(0)}%
                  </strong>
                </div>
              </div>
              <div className="result-body">{result.output}</div>
              {result.corrections?.length ? (
                <ul
                  style={{
                    marginTop: "18px",
                    padding: "0 18px",
                    color: "rgba(190, 242, 100, 0.9)",
                    lineHeight: 1.8
                  }}
                >
                  {result.corrections.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))
        ) : (
          <article className="result-card">
            <div className="result-title">لا توجد نتائج حتى الآن</div>
            <div className="result-body">
              أدخل نصاً أو ارفع ملفاً ثم اضغط على «ابدأ فك التشفير» لمشاهدة
              النتائج الذكية.
            </div>
          </article>
        )}
      </section>

      <footer className="footer">
        أفضل نتيجة حالية: {(bestConfidence * 100).toFixed(0)}% • يعمل محلياً دون
        رفع ملفات للخادم • مصمم للنشر على Vercel
      </footer>
    </main>
  );
};

export default Page;
