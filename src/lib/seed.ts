import { DB, Pkg, PkgFields, TreeNode, Asset, uid, nowIso } from "./store";
import crypto from "crypto";

// ===== Template draft (also reused by mock AI provider) =====
export function templateFields(atomTitle: string, level: 1 | 2 | 3): PkgFields {
  const lv = level === 1 ? "nhận biết" : level === 2 ? "thông hiểu" : "vận dụng";
  const depth =
    level === 1
      ? "Trình bày trực quan, nhiều hình ảnh, câu ngắn, một ý mỗi câu."
      : level === 2
      ? "Giải thích vì sao, kết nối với kiến thức đã học, có bước trung gian."
      : "Đặt trong tình huống mới, yêu cầu lập luận và trình bày lời giải.";
  return {
    objective: `Sau bài học, học sinh ${lv} được nội dung "${atomTitle}" và áp dụng vào bài tập ở mức tương ứng.`,
    explanation: `【Nháp AI — cần giáo viên rà soát】\n"${atomTitle}" được trình bày ở mức ${lv}. ${depth}\n\nGợi ý cấu trúc: (1) gợi mở từ ví dụ quen thuộc; (2) phát biểu nội dung chính bằng lời và bằng ký hiệu; (3) một ví dụ mẫu có lời giải; (4) chốt lại bằng một câu dễ nhớ.`,
    example: `Ví dụ 1: (giáo viên thay bằng ví dụ sát SGK cho "${atomTitle}").\nVí dụ 2: một tình huống thực tế gần gũi với học sinh.`,
    counterExample: `Một trường hợp trông giống nhưng KHÔNG áp dụng được "${atomTitle}" — dùng để học sinh phân biệt ranh giới áp dụng.`,
    commonMistake: `Lỗi thường gặp: học sinh áp dụng máy móc "${atomTitle}" mà không kiểm tra điều kiện; nhầm lẫn với khái niệm gần kề. Cách chữa: cho học sinh tự chỉ ra chỗ sai trong một lời giải sai.`,
    strategy: `Dẫn dắt kiểu Socratic: bắt đầu bằng câu hỏi "Em nhận thấy điều gì?", sau đó nâng dần: "Điều đó có luôn đúng không?", "Vì sao?", "Khi nào thì không đúng?". Chốt bằng hoạt động cặp đôi 3 phút.`,
    questions: `1. (${lv}) Câu hỏi kiểm tra trực tiếp nội dung "${atomTitle}".\n2. (${lv}) Câu hỏi có bối cảnh thay đổi nhẹ.\n3. (${lv}) Câu hỏi yêu cầu giải thích "vì sao".`,
  };
}

// ===== Seed =====
interface AtomSpec { code: string; title: string; }
interface PointSpec { title: string; atoms: AtomSpec[]; }
interface LessonSpec { title: string; points: PointSpec[]; }
interface ChapterSpec { title: string; lessons: LessonSpec[]; }

// Tạo node Môn (tầng gốc). Trả về id môn để gắn các Lớp bên dưới.
function ensureSubject(tree: TreeNode[], subjectId: string, subjectTitle: string, codePrefix: string): string {
  if (!tree.some((n) => n.id === subjectId)) {
    tree.push({ id: subjectId, kind: "subject", parentId: null, title: subjectTitle, code: codePrefix, order: tree.filter((n) => n.kind === "subject").length });
  }
  return subjectId;
}

// Gắn một Lớp (grade) vào Môn, rồi dựng chương/bài/điểm/nguyên tử bên dưới Lớp.
function addGrade(
  tree: TreeNode[], subjectId: string, codePrefix: string, grade: number, chapters: ChapterSpec[]
) {
  const gradeId = `${subjectId}-g${grade}`;
  const order = tree.filter((n) => n.kind === "grade" && n.parentId === subjectId).length;
  tree.push({ id: gradeId, kind: "grade", parentId: subjectId, title: `Lớp ${grade}`, code: `${codePrefix}.G${grade}`, order, grade });
  const gp = `${codePrefix}.G${grade}`;
  chapters.forEach((ch, ci) => {
    const chId = `${gradeId}-c${ci + 1}`;
    tree.push({ id: chId, kind: "chapter", parentId: gradeId, title: ch.title, code: `${gp}.C${ci + 1}`, order: ci });
    ch.lessons.forEach((ls, li) => {
      const lsId = `${chId}-b${li + 1}`;
      tree.push({ id: lsId, kind: "lesson", parentId: chId, title: ls.title, code: `${gp}.C${ci + 1}.B${li + 1}`, order: li });
      ls.points.forEach((pt, pi) => {
        const ptId = `${lsId}-d${pi + 1}`;
        tree.push({ id: ptId, kind: "point", parentId: lsId, title: pt.title, code: `${gp}.C${ci + 1}.B${li + 1}.${pi + 1}`, order: pi });
        pt.atoms.forEach((at, ai) => {
          tree.push({ id: at.code, kind: "atom", parentId: ptId, title: at.title, code: at.code, order: ai });
        });
      });
    });
  });
}

export function buildSeed(): DB {
  const tree: TreeNode[] = [];

  ensureSubject(tree, "toan", "Toán", "T");
  addGrade(tree, "toan", "T", 6, [
    {
      title: "Chương 1. Số tự nhiên",
      lessons: [
        {
          title: "Bài 1. Tập hợp",
          points: [
            { title: "Khái niệm tập hợp", atoms: [
              { code: "T6.1.1.1a", title: "Nhận biết tập hợp và phần tử của tập hợp" },
              { code: "T6.1.1.1b", title: "Sử dụng ký hiệu thuộc (∈) và không thuộc (∉)" },
            ]},
            { title: "Cách mô tả tập hợp", atoms: [
              { code: "T6.1.1.2a", title: "Viết tập hợp bằng cách liệt kê phần tử" },
              { code: "T6.1.1.2b", title: "Viết tập hợp bằng tính chất đặc trưng" },
            ]},
          ],
        },
        {
          title: "Bài 2. Cách ghi số tự nhiên",
          points: [
            { title: "Hệ thập phân", atoms: [
              { code: "T6.1.2.1a", title: "Cấu tạo số tự nhiên trong hệ thập phân" },
              { code: "T6.1.2.1b", title: "Viết số thành tổng giá trị các chữ số" },
            ]},
            { title: "Số La Mã", atoms: [
              { code: "T6.1.2.2a", title: "Đọc và viết số La Mã không quá 30" },
            ]},
          ],
        },
        {
          title: "Bài 3. Thứ tự trong tập hợp số tự nhiên",
          points: [
            { title: "So sánh hai số tự nhiên", atoms: [
              { code: "T6.1.3.1a", title: "So sánh hai số tự nhiên bất kỳ" },
              { code: "T6.1.3.1b", title: "Biểu diễn số tự nhiên trên tia số" },
            ]},
          ],
        },
        {
          title: "Bài 4. Phép cộng và phép trừ số tự nhiên",
          points: [
            { title: "Tính chất của phép cộng", atoms: [
              { code: "T6.1.4.1a", title: "Tính chất giao hoán của phép cộng" },
              { code: "T6.1.4.1b", title: "Tính chất kết hợp của phép cộng" },
              { code: "T6.1.4.1c", title: "Vận dụng tính chất để tính nhanh" },
            ]},
            { title: "Phép trừ số tự nhiên", atoms: [
              { code: "T6.1.4.2a", title: "Điều kiện thực hiện phép trừ trong tập số tự nhiên" },
            ]},
          ],
        },
        {
          title: "Bài 5. Phép nhân và phép chia số tự nhiên",
          points: [
            { title: "Tính chất của phép nhân", atoms: [
              { code: "T6.1.5.1a", title: "Tính chất giao hoán và kết hợp của phép nhân" },
              { code: "T6.1.5.1b", title: "Tính chất phân phối của phép nhân đối với phép cộng" },
            ]},
            { title: "Phép chia", atoms: [
              { code: "T6.1.5.2a", title: "Phép chia hết và phép chia có dư" },
            ]},
          ],
        },
      ],
    },
  ]);

  ensureSubject(tree, "khtn", "Khoa học tự nhiên", "K");
  addGrade(tree, "khtn", "K", 6, [
    {
      title: "Chương 5. Tế bào",
      lessons: [
        {
          title: "Bài 18. Tế bào — đơn vị cơ bản của sự sống",
          points: [
            { title: "Khái niệm và hình dạng tế bào", atoms: [
              { code: "K6.5.18.1a", title: "Tế bào là đơn vị cấu tạo cơ bản của sinh vật" },
              { code: "K6.5.18.1b", title: "Nhận biết hình dạng và kích thước một số loại tế bào" },
            ]},
            { title: "Cấu tạo tế bào", atoms: [
              { code: "K6.5.18.2a", title: "Ba thành phần chính của tế bào" },
              { code: "K6.5.18.2b", title: "Phân biệt tế bào thực vật và tế bào động vật" },
            ]},
          ],
        },
      ],
    },
  ]);

  // ===== Khung đầy đủ các môn Lớp 6 (GDPT 2018) — trống để giáo viên đổ nội dung =====
  const grade6Subjects: [string, string, string][] = [
    ["nguvan", "Ngữ văn", "V"],
    ["tienganh", "Tiếng Anh", "A"],
    ["lichsu-diali", "Lịch sử và Địa lí", "LD"],
    ["gdcd", "Giáo dục công dân", "GD"],
    ["tinhoc", "Tin học", "TH"],
    ["congnghe", "Công nghệ", "CN"],
    ["gdtc", "Giáo dục thể chất", "TC"],
    ["nghethuat", "Nghệ thuật", "NT"],
    ["hdtn", "Hoạt động trải nghiệm, hướng nghiệp", "HN"],
    ["gddp", "Nội dung giáo dục địa phương", "DP"],
  ];
  for (const [sid, title, prefix] of grade6Subjects) {
    ensureSubject(tree, sid, title, prefix);
    addGrade(tree, sid, prefix, 6, []);
  }
  // Toán trải thêm Lớp 7 (khung trống) để minh hoạ một Môn xuyên nhiều Lớp
  addGrade(tree, "toan", "T", 7, []);

  // ===== Packages =====
  const packages: Pkg[] = [];
  const t = nowIso();
  const mk = (atomId: string, level: 1 | 2 | 3, status: Pkg["status"], fields: PkgFields, by: string, version = 1): Pkg => ({
    id: `${atomId}-L${level}`, atomId, level, status, fields, version,
    bloom: level === 1 ? "Nhớ / Hiểu" : level === 2 ? "Hiểu / Áp dụng" : "Áp dụng / Phân tích",
    updatedAt: t, updatedBy: by,
    history: [{ version: 1, at: t, by: "AI (nháp hàng loạt)", note: "Nháp tự động từ cây kiến thức" }],
  });

  // Hero atom: fully hand-authored, approved
  const hero = "T6.1.4.1a";
  packages.push(mk(hero, 1, "approved", {
    objective: "Học sinh phát biểu được tính chất giao hoán của phép cộng (a + b = b + a) và nhận ra tính chất này trong các phép tính cụ thể.",
    explanation: "Khi cộng hai số tự nhiên, đổi chỗ hai số thì tổng KHÔNG thay đổi.\n\nViết bằng ký hiệu: a + b = b + a.\n\nHình dung: em có 3 viên bi đỏ và 5 viên bi xanh. Đếm bi đỏ trước hay bi xanh trước thì tổng vẫn là 8 viên. Thứ tự đếm không làm thay đổi số bi.\n\nCâu chốt dễ nhớ: \"Đổi chỗ — tổng không đổi\".",
    example: "Ví dụ 1: 4 + 9 = 13 và 9 + 4 = 13. Vậy 4 + 9 = 9 + 4.\nVí dụ 2: Lan có 12 nhãn vở, mẹ cho thêm 25 nhãn. Số nhãn của Lan là 12 + 25 = 25 + 12 = 37 nhãn — cộng theo thứ tự nào cũng được.",
    counterExample: "Phép TRỪ không có tính chất này: 9 − 4 = 5 nhưng 4 − 9 không thực hiện được trong số tự nhiên. Vậy không phải phép tính nào cũng \"đổi chỗ\" được.",
    commonMistake: "Học sinh thường áp dụng nhầm sang phép trừ (viết 15 − 7 = 7 − 15). Cách chữa: cho học sinh thử tính cả hai vế bằng số cụ thể để tự thấy khác nhau.",
    strategy: "Khởi động bằng trò chơi: hai nhóm đếm cùng một rổ đồ vật theo hai thứ tự khác nhau, so sánh kết quả. Hỏi: \"Vì sao hai nhóm ra cùng một số?\" → dẫn vào tính chất. Sau đó cho học sinh tự lấy ví dụ và một phản ví dụ với phép trừ.",
    questions: "1. (Nhận biết) Điền số: 27 + 45 = 45 + ▢.\n2. (Nhận biết) Phép tính nào minh họa tính chất giao hoán: a) 3+8=8+3; b) 3×8=8×3; c) 8−3=3−8?\n3. (Nhận biết) Đúng hay sai: \"Khi đổi chỗ hai số hạng, tổng không thay đổi\"?",
  }, "Cô Lan (Toán)", 3));
  packages[packages.length - 1].status = "approved";
  packages[packages.length - 1].history.push(
    { version: 2, at: t, by: "Cô Lan (Toán)", note: "Bổ sung ví dụ nhãn vở, chỉnh câu chốt" },
    { version: 3, at: t, by: "Thầy Minh (Tổ trưởng)", note: "Duyệt lên Chuẩn trường" },
  );

  packages.push(mk(hero, 2, "approved", {
    objective: "Học sinh giải thích được vì sao a + b = b + a và sử dụng tính chất giao hoán để sắp xếp lại phép tính cho thuận tiện.",
    explanation: "Tính chất giao hoán: a + b = b + a với mọi số tự nhiên a, b.\n\nVì sao đúng? Phép cộng là gộp hai nhóm đồ vật thành một nhóm. Gộp nhóm A vào nhóm B hay gộp nhóm B vào nhóm A đều cho cùng một nhóm tổng — số phần tử không phụ thuộc thứ tự gộp.\n\nÝ nghĩa thực dụng: khi cộng nhiều số, ta được QUYỀN đổi chỗ các số hạng để những số \"đẹp\" (tròn chục, tròn trăm) đứng cạnh nhau, giúp tính nhanh hơn.",
    example: "Ví dụ 1: Tính 37 + 89 + 63. Đổi chỗ: 37 + 63 + 89 = 100 + 89 = 189 — nhanh hơn cộng lần lượt.\nVí dụ 2: 258 + 499 + 42 + 1 = (258 + 42) + (499 + 1) = 300 + 500 = 800.",
    counterExample: "18 − 5 ≠ 5 − 18 và 20 : 4 ≠ 4 : 20 — phép trừ và phép chia không giao hoán. Chỉ đổi chỗ được các SỐ HẠNG trong tổng, không đổi chỗ tùy tiện trong biểu thức có trừ.",
    commonMistake: "Trong biểu thức 100 − 37 + 37, học sinh đổi chỗ thành 100 − (37 + 37) rồi ra 26 — sai vì đã gộp nhầm dấu trừ. Cách chữa: nhấn mạnh chỉ số hạng mang dấu cộng mới đổi chỗ tự do.",
    strategy: "Cho bài tính 37 + 89 + 63 và bấm giờ hai cách làm (lần lượt vs đổi chỗ). Học sinh tự rút ra lợi ích. Hỏi nâng: \"Tính chất này còn đúng với phép nhân không? Với phép trừ thì sao?\" — nối sang bài sau.",
    questions: "1. (Thông hiểu) Tính nhanh: 46 + 175 + 54.\n2. (Thông hiểu) Giải thích vì sao 12 + 88 + 45 = 100 + 45 mà không cần tính lần lượt.\n3. (Thông hiểu) Bạn An viết 90 − 25 = 25 − 90. Chỉ ra chỗ sai và sửa lại.",
  }, "Cô Lan (Toán)", 2));
  packages[packages.length - 1].history.push({ version: 2, at: t, by: "Thầy Minh (Tổ trưởng)", note: "Duyệt lên Chuẩn trường" });

  packages.push(mk(hero, 3, "approved", {
    objective: "Học sinh vận dụng linh hoạt tính chất giao hoán (kết hợp với tính chất kết hợp) để tính nhanh, chứng minh đẳng thức đơn giản và giải bài toán thực tế.",
    explanation: "Ở mức vận dụng, tính chất giao hoán ít khi đứng một mình — nó là \"quyền đổi chỗ\" được dùng cùng \"quyền nhóm lại\" (tính chất kết hợp) để tái cấu trúc tổng nhiều số hạng.\n\nChiến lược chung: quan sát toàn bộ dãy số → tìm các cặp có tổng tròn chục/trăm/nghìn → đổi chỗ để ghép cặp → cộng các kết quả trung gian.\n\nMức này cũng yêu cầu nhận ra khi nào KHÔNG dùng được (biểu thức có phép trừ, phép chia xen kẽ).",
    example: "Ví dụ 1: Tính tổng 1 + 2 + 3 + … + 99 + 100 bằng cách ghép cặp đầu–cuối: (1+100) + (2+99) + … = 101 × 50 = 5050.\nVí dụ 2: Cửa hàng bán 4 món giá 125.000đ, 78.000đ, 275.000đ, 22.000đ. Ghép (125+275) và (78+22) nghìn đồng → 400 + 100 = 500 nghìn đồng.",
    counterExample: "Dãy 100 − 99 + 98 − 97 + … không được tự do đổi chỗ vì có phép trừ; muốn nhóm phải giữ nguyên dấu đi kèm từng số: (100 − 99) + (98 − 97) + …",
    commonMistake: "Học sinh ghép cặp nhưng để sót số hạng (dãy lẻ phần tử) hoặc đổi chỗ cả số bị trừ. Cách chữa: yêu cầu đếm số hạng trước khi ghép và gạch chân dấu của từng số hạng.",
    strategy: "Giao bài toán Gauss (cộng 1 đến 100) như một thử thách mở, cho thảo luận nhóm 5 phút trước khi gợi ý. Sau đó yêu cầu mỗi nhóm tự sáng tác một \"dãy cộng nhanh\" đố nhóm khác — học sinh phải hiểu cấu trúc mới ra đề được.",
    questions: "1. (Vận dụng) Tính nhanh: 2 + 4 + 6 + … + 98 + 100.\n2. (Vận dụng) Tìm x biết x + 37 + 163 = 300.\n3. (Vận dụng) Bốn bạn góp quỹ lớp: 27.000đ, 45.000đ, 73.000đ, 55.000đ. Tính tổng bằng cách hợp lý nhất và giải thích cách ghép.",
  }, "Cô Lan (Toán)", 2));
  packages[packages.length - 1].history.push({ version: 2, at: t, by: "Thầy Minh (Tổ trưởng)", note: "Duyệt lên Chuẩn trường" });

  // Pending review: kết hợp (L2) — edited by teacher, submitted
  packages.push(mk("T6.1.4.1b", 2, "pending_review", {
    objective: "Học sinh giải thích được tính chất kết hợp (a + b) + c = a + (b + c) và dùng nó để nhóm các số hạng thuận tiện.",
    explanation: "Khi cộng ba số trở lên, ta có thể NHÓM hai số bất kỳ để cộng trước — kết quả cuối không đổi.\n\nKý hiệu: (a + b) + c = a + (b + c).\n\nKết hợp với tính chất giao hoán, ta có toàn quyền sắp xếp và nhóm các số hạng của một tổng theo cách thuận tiện nhất.",
    example: "Ví dụ 1: (28 + 45) + 55 = 28 + (45 + 55) = 28 + 100 = 128.\nVí dụ 2: 17 + 25 + 83 + 75 = (17 + 83) + (25 + 75) = 100 + 100 = 200.",
    counterExample: "(20 − 8) − 2 = 10 nhưng 20 − (8 − 2) = 14 — phép trừ không kết hợp, vị trí dấu ngoặc làm thay đổi kết quả.",
    commonMistake: "Học sinh di chuyển dấu ngoặc trong biểu thức có phép trừ như thể nó là phép cộng. Cách chữa: bài tập so sánh cặp biểu thức chỉ khác vị trí ngoặc.",
    strategy: "Đưa phép tính 28 + 45 + 55, hỏi \"cộng cặp nào trước thì sướng tay nhất?\". Học sinh tự phát hiện việc nhóm 45 + 55. Từ đó phát biểu tính chất bằng lời của chính các em trước khi cô chốt ký hiệu.",
    questions: "1. (Thông hiểu) Tính bằng cách thuận tiện: 34 + 66 + 79.\n2. (Thông hiểu) Điền vào chỗ trống: (a + 25) + 75 = a + (▢ + ▢).\n3. (Thông hiểu) Vì sao (30 − 10) − 5 ≠ 30 − (10 − 5)?",
  }, "Cô Lan (Toán)", 2));
  packages[packages.length - 1].history.push({ version: 2, at: t, by: "Cô Lan (Toán)", note: "Biên soạn lại từ nháp AI, gửi duyệt" });

  // Edited (not yet submitted): vận dụng tính nhanh L3
  packages.push(mk("T6.1.4.1c", 3, "edited", {
    ...templateFields("Vận dụng tính chất để tính nhanh", 3),
    objective: "Học sinh phối hợp tính chất giao hoán và kết hợp để tính nhanh tổng nhiều số hạng, kể cả dãy số có quy luật.",
    explanation: "Bài tổng hợp của hai tính chất: quan sát — đổi chỗ — nhóm cặp — cộng. Trọng tâm là kỹ năng QUAN SÁT dãy số trước khi đặt bút: tìm cặp tròn chục, tròn trăm; đếm số hạng; đánh dấu số lẻ loi nếu có.",
  }, "Cô Lan (Toán)", 2));
  packages[packages.length - 1].history.push({ version: 2, at: t, by: "Cô Lan (Toán)", note: "Đang biên soạn phần giải thích" });

  // All other Toán 6 atoms: AI drafts, all 3 levels
  const seededAtoms = new Set([hero, "T6.1.4.1b", "T6.1.4.1c"]);
  const seededLevels: Record<string, number[]> = { [hero]: [1, 2, 3], "T6.1.4.1b": [2], "T6.1.4.1c": [3] };
  for (const n of tree.filter((n) => n.kind === "atom" && n.code.startsWith("T6"))) {
    for (const level of [1, 2, 3] as const) {
      if (seededAtoms.has(n.id) && (seededLevels[n.id] || []).includes(level)) continue;
      packages.push(mk(n.id, level, "draft_ai", templateFields(n.title, level), "AI (nháp hàng loạt)"));
    }
  }
  // KHTN 6: no packages yet — dùng để demo "nháp hàng loạt"

  // ===== Assets for hero L2 =====
  const assets: Asset[] = [];
  const heroPkgId = `${hero}-L2`;
  const mkAsset = (format: Asset["format"], content: unknown, status: Asset["status"] = "ready", pkgId = heroPkgId, pkgVersion = 2): Asset => ({
    id: uid("as_"), packageId: pkgId, format, status, content,
    createdAt: t, createdBy: "Cô Lan (Toán)", model: "mock-composer", tokens: 1850, costUsd: 0.0055, pkgVersion,
  });

  assets.push(mkAsset("slide", { slides: [
    { title: "Tính chất giao hoán của phép cộng", bullets: ["Toán 6 — Chương 1 — Bài 4", "Mức độ: Thông hiểu"], notes: "Slide mở đầu, giới thiệu mục tiêu." },
    { title: "Khởi động", bullets: ["Tính: 37 + 89 + 63", "Em mất bao lâu?", "Có cách nào nhanh hơn không?"], notes: "Cho học sinh làm 1 phút, bấm giờ." },
    { title: "Tính chất", bullets: ["a + b = b + a", "Đổi chỗ hai số hạng — tổng không đổi", "Vì sao? Gộp nhóm A vào B hay B vào A đều là một nhóm"], notes: "Chốt bằng câu dễ nhớ." },
    { title: "Áp dụng: tính nhanh", bullets: ["37 + 89 + 63 = (37 + 63) + 89", "= 100 + 89 = 189", "Ghép cặp tròn trăm trước!"], notes: "So sánh với cách cộng lần lượt." },
    { title: "Cẩn thận!", bullets: ["18 − 5 ≠ 5 − 18", "Phép trừ KHÔNG giao hoán", "Chỉ số hạng mang dấu cộng mới đổi chỗ tự do"], notes: "Phản ví dụ quan trọng." },
    { title: "Luyện tập", bullets: ["1) 46 + 175 + 54", "2) 258 + 499 + 42 + 1", "3) Vì sao 90 − 25 ≠ 25 − 90?"], notes: "Làm cặp đôi 5 phút." },
  ]}));

  assets.push(mkAsset("quiz", { questions: [
    { type: "mcq", q: "Tính nhanh 46 + 175 + 54 bằng cách thuận tiện nhất:", options: ["(46 + 54) + 175 = 275", "46 + (175 + 54) = 275", "Cộng lần lượt từ trái sang phải", "(46 + 175) + 54 = 275"], answer: 0, explanation: "Ghép 46 + 54 = 100 trước — cặp tròn trăm giúp tính nhẩm ngay 275." },
    { type: "tf", q: "Với mọi số tự nhiên a, b ta có a − b = b − a.", answer: false, explanation: "Phép trừ không giao hoán: 9 − 4 = 5 nhưng 4 − 9 không thực hiện được trong ℕ." },
    { type: "mcq", q: "Đẳng thức nào minh họa tính chất giao hoán của phép cộng?", options: ["3 × 8 = 8 × 3", "12 + 45 = 45 + 12", "(2 + 3) + 5 = 2 + (3 + 5)", "10 − 0 = 10"], answer: 1, explanation: "Giao hoán của phép cộng là đổi chỗ hai SỐ HẠNG. Câu (2+3)+5 là tính chất kết hợp." },
    { type: "fill", q: "Điền số thích hợp: 127 + 386 = 386 + ___", answer: "127", explanation: "Áp dụng trực tiếp a + b = b + a." },
    { type: "mcq", q: "Bạn An viết: 100 − 37 + 37 = 100 − (37 + 37) = 26. Nhận xét nào đúng?", options: ["An làm đúng", "An sai vì gộp nhầm dấu trừ vào ngoặc", "An sai vì 37 + 37 = 84", "Không kết luận được"], answer: 1, explanation: "100 − 37 + 37 = 100. Chỉ số hạng mang dấu cộng mới được nhóm tự do." },
  ]}));

  assets.push(mkAsset("mindmap", { markdown: `# Tính chất giao hoán của phép cộng
## Phát biểu
### a + b = b + a
### "Đổi chỗ — tổng không đổi"
## Vì sao đúng
### Cộng = gộp hai nhóm
### Thứ tự gộp không đổi số phần tử
## Áp dụng
### Ghép cặp tròn chục / tròn trăm
### 37 + 89 + 63 = (37+63) + 89
### Kết hợp với tính chất kết hợp
## Cảnh giác
### Phép trừ KHÔNG giao hoán
### 18 − 5 ≠ 5 − 18
### Chỉ đổi chỗ số hạng mang dấu +` }));

  assets.push(mkAsset("flashcard", { cards: [
    { front: "Tính chất giao hoán của phép cộng phát biểu thế nào?", back: "Khi đổi chỗ hai số hạng, tổng không thay đổi: a + b = b + a." },
    { front: "37 + 89 + 63 — cách tính nhanh?", back: "Đổi chỗ để ghép cặp tròn trăm: (37 + 63) + 89 = 100 + 89 = 189." },
    { front: "Phép trừ có giao hoán không? Cho ví dụ.", back: "Không. 9 − 4 = 5 nhưng 4 − 9 không thực hiện được trong số tự nhiên." },
    { front: "Trong biểu thức có phép trừ, số nào được đổi chỗ tự do?", back: "Chỉ các số hạng mang dấu cộng. Số bị trừ/số trừ phải giữ nguyên vị trí kèm dấu." },
  ]}));

  assets.push(mkAsset("podcast", { script: [
    { speaker: "Cô Mai", text: "Chào các em, hôm nay cô và Bin sẽ nói về một 'quyền năng' rất hay trong phép cộng — quyền đổi chỗ!" },
    { speaker: "Bin", text: "Quyền đổi chỗ ạ? Nghe như đổi chỗ ngồi trong lớp vậy cô." },
    { speaker: "Cô Mai", text: "Đúng vậy đó. Em thử tính nhanh cho cô: 37 cộng 89 cộng 63?" },
    { speaker: "Bin", text: "Ơ… 37 cộng 89 là 126, cộng 63 nữa là… 189. Nhưng em phải nháp đó cô!" },
    { speaker: "Cô Mai", text: "Giờ cô đổi chỗ nhé: 37 cộng 63 trước — được bao nhiêu?" },
    { speaker: "Bin", text: "100 ạ! Rồi cộng 89 là 189 luôn. Nhẩm được luôn, không cần nháp!" },
    { speaker: "Cô Mai", text: "Đó chính là tính chất giao hoán: a cộng b bằng b cộng a. Đổi chỗ các số hạng, tổng không hề thay đổi." },
    { speaker: "Bin", text: "Vậy phép trừ em cũng đổi chỗ được không cô? 5 trừ 9 với 9 trừ 5?" },
    { speaker: "Cô Mai", text: "Câu hỏi rất hay — và câu trả lời là KHÔNG. 9 trừ 4 bằng 5, nhưng 4 trừ 9 thì trong số tự nhiên không làm được. Quyền đổi chỗ chỉ dành cho phép cộng và phép nhân thôi." },
    { speaker: "Bin", text: "Em nhớ rồi: đổi chỗ — tổng không đổi, nhưng đừng dại mà đổi chỗ phép trừ!" },
    { speaker: "Cô Mai", text: "Chuẩn luôn. Bài tập về nhà: tính nhanh 46 cộng 175 cộng 54 và kể cho bố mẹ nghe vì sao em tính nhanh được nhé. Hẹn gặp lại các em!" },
  ]}));

  assets.push(mkAsset("video", { scenes: [
    { visual: "Hoạt hình: hai rổ táo (3 quả đỏ, 5 quả xanh) đổ vào một giỏ, theo hai thứ tự khác nhau", narration: "Gộp rổ đỏ vào rổ xanh, hay rổ xanh vào rổ đỏ — giỏ táo vẫn có đúng 8 quả." },
    { visual: "Chữ lớn xuất hiện: a + b = b + a, hiệu ứng hai số hạng đổi chỗ cho nhau", narration: "Đó là tính chất giao hoán của phép cộng: đổi chỗ hai số hạng, tổng không thay đổi." },
    { visual: "Bảng tính 37 + 89 + 63; số 63 bay lên cạnh 37, ghép thành khối 100", narration: "Tính chất này cho em quyền sắp xếp lại phép tính: ghép 37 với 63 thành 100, cộng 89 — ra ngay 189." },
    { visual: "Biển cảnh báo đỏ; phép tính 4 − 9 bị gạch chéo", narration: "Nhưng cẩn thận: phép trừ không có quyền này. 9 trừ 4 được 5, còn 4 trừ 9 thì không thực hiện được." },
    { visual: "Tổng kết: 3 gạch đầu dòng xuất hiện lần lượt + nhân vật giơ ngón cái", narration: "Ghi nhớ: đổi chỗ — tổng không đổi; ghép cặp tròn chục tròn trăm để tính nhanh; và đừng áp dụng cho phép trừ nhé!" },
  ], durationSec: 90, style: "Hoạt hình 2D, nhân vật học sinh + cô giáo, bảng màu tươi sáng" }, "ready"));

  // Một asset outdated để demo staleness (worksheet cho hero L1, sinh từ version cũ)
  assets.push({ ...mkAsset("worksheet", { sections: [
    { heading: "Phần A — Khởi động (5 phút)", body: "Điền số thích hợp:\n1) 27 + 45 = 45 + ▢\n2) 138 + ▢ = 62 + 138\n3) a + 75 = ▢ + a" },
    { heading: "Phần B — Luyện tập (15 phút)", body: "4) Tính rồi so sánh: 58 + 26 và 26 + 58.\n5) Đúng ghi Đ, sai ghi S:\n   a) 34 + 66 = 66 + 34 ▢\n   b) 90 − 15 = 15 − 90 ▢\n6) Viết hai phép cộng khác nhau có cùng các số hạng 17 và 83." },
    { heading: "Phần C — Thử thách", body: "7) Không tính tổng, giải thích vì sao 123 + 877 = 877 + 123.\n8) Dãy nào tính nhanh được nhờ đổi chỗ: 25 + 47 + 75 hay 25 − 47 + 75? Vì sao?" },
  ]}, "outdated", `${hero}-L1`, 2), createdBy: "AI (dây chuyền)", });

  // tài liệu tham khảo mẫu gắn vào nguyên tử/bài
  const heroAtom = tree.find((n) => n.id === hero);
  if (heroAtom) heroAtom.refs = [
    { id: uid("rf_"), title: "SGK Toán 6 (Kết nối tri thức) — tr. 16", url: "https://drive.google.com/file/d/1AbcSGKToan6/view", kind: "sgk" },
    { id: uid("rf_"), title: "Giáo án mẫu — Tính chất phép cộng", url: "https://drive.google.com/file/d/1DefGiaoAn/view", kind: "drive" },
    { id: uid("rf_"), title: "Video minh hoạ giao hoán (YouTube)", url: "https://youtu.be/example", kind: "video" },
  ];
  const chap = tree.find((n) => n.id === "toan6-c1");
  if (chap) chap.refs = [{ id: uid("rf_"), title: "Thư mục Drive: Chương 1 — Số tự nhiên", url: "https://drive.google.com/drive/folders/1Chuong1", kind: "drive" }];

  const mkSkill = (agent: string, style: string, imageStyle: string, guide: string) => ({ agent, style, imageStyle, guide });
  const formatSkills = {
    text: mkSkill("Soạn giả Văn bản", "Văn phong sư phạm, câu ngắn, xưng \"cô/thầy — em\", mỗi ý một đoạn, in đậm từ khoá.", "", "Cấu trúc: mở bài gợi động cơ → nội dung chính → ví dụ → chốt kiến thức bằng câu dễ nhớ."),
    worksheet: mkSkill("Soạn giả Phiếu học tập", "Ngắn gọn, có chỗ trống điền, tăng dần độ khó.", "", "Chia 3 phần: khởi động, luyện tập, thử thách. Có đáp án gợi ý riêng."),
    slide: mkSkill("Đạo diễn Slide", "Mỗi slide một ý, tối đa 5 dòng, tiêu đề động từ.", "Nền sáng, minh hoạ phẳng tối giản, tông xanh lá của trường.", "6–8 slide: bìa → khởi động → nội dung → ví dụ → cảnh báo lỗi → luyện tập."),
    quiz: mkSkill("Chuyên gia Khảo thí", "Câu hỏi rõ ràng, nhiễu hợp lý, bám chuẩn.", "", "Trộn MCQ/Đúng-Sai/Điền khuyết theo 3 mức Bloom; kèm giải thích đáp án."),
    mindmap: mkSkill("Kiến trúc sư Sơ đồ", "Từ khoá súc tích, phân cấp rõ.", "", "Gốc = tên nguyên tử; nhánh cấp 1 = ý chính; tối đa 3 cấp."),
    flashcard: mkSkill("Chuyên gia Ghi nhớ", "Mặt trước hỏi, mặt sau đáp gọn.", "", "4–6 thẻ, câu hỏi kích thích gợi nhớ, không chép nguyên văn."),
    podcast: mkSkill("Biên kịch Podcast", "Hội thoại tự nhiên Cô Mai & bé Bin, dí dỏm, đời thường.", "", "10–14 lượt thoại, mở bằng câu hỏi tò mò, chốt bằng bài tập nhỏ."),
    video: mkSkill("Đạo diễn Video hoạt hình", "Lời thoại ngắn, hình ảnh dẫn dắt.", "Hoạt hình 2D, nhân vật học sinh, bảng màu xanh lá tươi sáng, nét mềm.", "Storyboard 5 cảnh ~90s: mở → khái niệm → ví dụ → cảnh báo → tổng kết."),
  };

  const secret = crypto.randomBytes(24).toString("hex");

  return {
    secret,
    users: [
      { id: "gv.lan", name: "Cô Lan", role: "teacher", subject: "Toán", title: "Giáo viên Toán" },
      { id: "tt.minh", name: "Thầy Minh", role: "lead", subject: "Toán", title: "Tổ trưởng tổ Toán" },
      { id: "qt.hung", name: "Anh Hùng", role: "admin", title: "Quản trị học thuật" },
      { id: "bgh.duong", name: "Thầy Dương", role: "principal", title: "Ban giám hiệu" },
    ],
    tree, edges: [], packages, assets,
    reviews: [],
    jobs: [],
    cardStates: [],
    questions: [], ladders: [],
    proposals: [
      { id: uid("pr_"), kind: "split", targetTitle: "T6.1.4.1c — Vận dụng tính chất để tính nhanh", description: "Đề xuất tách thành 2 nguyên tử: (1) tính nhanh tổng không quy luật bằng ghép cặp; (2) tính tổng dãy có quy luật (kiểu Gauss). Hiện gộp chung khiến mức Vận dụng quá rộng.", status: "open", by: "Cô Lan (Toán)", at: t },
    ],
    activity: [
      { at: t, by: "Thầy Minh", action: "duyệt lên Chuẩn trường", target: "Gói T6.1.4.1a — mức Thông hiểu", href: `/package/${hero}-L2` },
      { at: t, by: "Cô Lan", action: "gửi duyệt", target: "Gói T6.1.4.1b — mức Thông hiểu", href: "/package/T6.1.4.1b-L2" },
      { at: t, by: "AI (dây chuyền)", action: "sinh", target: "6 tài nguyên cho T6.1.4.1a", href: "/atom/T6.1.4.1a" },
    ],
    settings: {
      styleGuide: "Giọng văn thân thiện, chủ động, xưng \"cô/thầy — em\". Câu ngắn. Mỗi khái niệm đi kèm ít nhất một ví dụ đời thường của học sinh Việt Nam (tiền Việt, đồ dùng học tập, trò chơi quen thuộc). Thuật ngữ theo SGK chương trình GDPT 2018.",
      gradeRules: "Lớp 6: tránh ký hiệu logic hình thức; ưu tiên hình ảnh hóa; bài đọc tối đa 400 chữ/mức Nhận biết. Mức Vận dụng được phép dùng bài toán nhiều bước nhưng không vượt chuẩn đầu ra của khối.",
      philosophy: "Vui vẻ & Thực dụng: học qua tình huống thật, chốt kiến thức bằng câu dễ nhớ, luôn có phần \"vì sao\" chứ không chỉ \"là gì\".",
      monthlyBudgetUsd: 200,
      formatSkills,
    },
  };
}
