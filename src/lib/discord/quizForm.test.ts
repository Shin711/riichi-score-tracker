import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ComponentType,
  InteractionResponseType,
  MessageFlags,
} from "@/lib/discord/interactions";
import {
  answerButtonId,
  answerModalId,
  beginnerButtonId,
  beginnerModalId,
  buildAlreadyAnsweredReply,
  buildAnswerModal,
  buildAnswerReceipt,
  buildBeginnerModal,
  buildUnavailableReply,
  FIELD_FU,
  FIELD_HAN,
  FIELD_SCORE,
  parseCustomId,
  quizIdFromCustomId,
} from "@/lib/discord/quizForm";
import { parseCount, parseScore, type AnswerGrade } from "@/lib/quiz/answer";
import type { QuizHand } from "@/lib/quiz/hand";
import type { SolvedHand } from "@/lib/quiz/solve";

const HAND: QuizHand = {
  concealed: ["2m", "3m", "4m"],
  melds: [],
  winningTile: "5m",
  winType: "ron",
  seatWind: "south",
  roundWind: "east",
  doraIndicator: "1s",
  riichi: true,
};

describe("quizForm", () => {
  it("round-trips the quiz id through button and modal custom ids", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    assert.equal(quizIdFromCustomId(answerButtonId(id)), id);
    assert.equal(quizIdFromCustomId(answerModalId(id)), id);
    assert.equal(quizIdFromCustomId(beginnerButtonId(id)), id);
    assert.equal(quizIdFromCustomId(beginnerModalId(id)), id);
  });

  it("tells the beginner controls apart from the regular ones", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    assert.deepEqual(parseCustomId(answerButtonId(id)), { kind: "answer", quizId: id });
    assert.deepEqual(parseCustomId(answerModalId(id)), { kind: "modal", quizId: id });
    assert.deepEqual(parseCustomId(beginnerButtonId(id)), { kind: "beginner", quizId: id });
    assert.deepEqual(parseCustomId(beginnerModalId(id)), { kind: "beginner-modal", quizId: id });
    assert.equal(parseCustomId("quiz:other:x"), null);
  });

  it("opens a modal (Discord's initial response — it cannot be deferred)", () => {
    const modal = buildAnswerModal("quiz-1", HAND);
    assert.equal(modal.type, InteractionResponseType.Modal);
    assert.equal(modal.data.custom_id, answerModalId("quiz-1"));
    assert.equal(modal.data.components.length, 3);
  });

  it("wraps each text field in a label, the layout Discord now asks for", () => {
    const modal = buildAnswerModal("quiz-1", HAND);
    assert.deepEqual(
      modal.data.components.map((row) => [
        row.type,
        row.label,
        row.component.type,
        row.component.custom_id,
      ]),
      [
        [ComponentType.Label, "Han", ComponentType.TextInput, FIELD_HAN],
        [ComponentType.Label, "Fu", ComponentType.TextInput, FIELD_FU],
        [ComponentType.Label, "Score", ComponentType.TextInput, FIELD_SCORE],
      ]
    );
    for (const row of modal.data.components) {
      // The caption lives on the label; a text input's own one is deprecated.
      assert.ok(!("label" in row.component));
      assert.ok(row.label.length <= 45 && row.description.length <= 100);
      assert.ok(row.component.placeholder.length <= 100);
    }
  });

  it("phrases the typed score field for the kind of win", () => {
    const score = (hand: QuizHand) => buildAnswerModal("quiz-1", hand).data.components[2];
    assert.match(score(HAND).description, /discarder/);
    assert.match(score(HAND).component.placeholder, /3900/);
    const tsumo = score({ ...HAND, winType: "tsumo" });
    assert.match(tsumo.description, /non-dealer \/ dealer/);
    assert.match(tsumo.component.placeholder, /1300\/2600/);
    const dealer = score({ ...HAND, winType: "tsumo", seatWind: "east" });
    assert.match(dealer.description, /each of the other three/);
    assert.match(dealer.component.placeholder, /2000 all/);
  });

  it("uses an ephemeral message when the quiz is unavailable", () => {
    const reply = buildUnavailableReply("closed");
    assert.equal(reply.type, InteractionResponseType.ChannelMessageWithSource);
    assert.equal(reply.data.flags, MessageFlags.Ephemeral);
  });
});

describe("beginner modal", () => {
  /** 234m 567m 345p 67p 55s, ron 8p under riichi: 3 han 30 fu, 3900. */
  const PINFU: QuizHand = {
    concealed: ["2m", "3m", "4m", "5m", "6m", "7m", "3p", "4p", "5p", "6p", "7p", "5s", "5s"],
    melds: [],
    winningTile: "8p",
    winType: "ron",
    seatWind: "south",
    roundWind: "east",
    doraIndicator: "1z",
    riichi: true,
  };
  const SOLVED: SolvedHand = {
    han: 3,
    fu: 30,
    ten: 3900,
    tsumoPayment: null,
    yaku: [
      { name: "Pinfu", han: 1 },
      { name: "Riichi", han: 1 },
      { name: "Tanyao", han: 1 },
    ],
    yakumanCount: 0,
    isDealer: false,
  };

  type Select = {
    type: number;
    custom_id: string;
    options: Array<{ label: string; value: string; description?: string }>;
  };
  type ModalComponent = { type: number; component?: Select };

  function selects(modal: ReturnType<typeof buildBeginnerModal>): Select[] {
    return (modal.data.components as ModalComponent[]).flatMap((component) =>
      component.type === ComponentType.Label && component.component ? [component.component] : []
    );
  }

  it("opens a modal of select menus, one per question, inside Discord's limits", () => {
    const modal = buildBeginnerModal("quiz-1", PINFU, SOLVED);
    assert.equal(modal.type, InteractionResponseType.Modal);
    assert.equal(modal.data.custom_id, beginnerModalId("quiz-1"));
    assert.ok(modal.data.title.length <= 45);
    assert.ok(modal.data.components.length >= 1 && modal.data.components.length <= 5);

    const menus = selects(modal);
    assert.deepEqual(
      menus.map((menu) => menu.custom_id),
      [FIELD_HAN, FIELD_FU, FIELD_SCORE]
    );
    for (const menu of menus) {
      assert.equal(menu.type, ComponentType.StringSelect);
      assert.ok(menu.options.length >= 3 && menu.options.length <= 6);
      for (const option of menu.options) {
        assert.ok(option.label.length <= 100 && option.value.length <= 100);
        assert.ok((option.description ?? "").length <= 100);
      }
    }
  });

  it("offers values the answer parser reads back, with the right answer among them", () => {
    const [han, fu, score] = selects(buildBeginnerModal("quiz-1", PINFU, SOLVED));
    assert.ok(han.options.every((option) => parseCount(option.value) !== null));
    assert.ok(fu.options.every((option) => parseCount(option.value) !== null));
    assert.ok(score.options.every((option) => parseScore(option.value) !== null));
    assert.ok(han.options.some((option) => option.value === "3"));
    assert.ok(fu.options.some((option) => option.value === "30"));
    assert.ok(score.options.some((option) => option.value === "3900"));
  });

  it("shows the same options each time the button is pressed", () => {
    assert.deepEqual(
      buildBeginnerModal("quiz-1", PINFU, SOLVED),
      buildBeginnerModal("quiz-1", PINFU, SOLVED)
    );
  });

  it("phrases the score question for the kind of win", () => {
    const question = (hand: QuizHand) =>
      (buildBeginnerModal("quiz-1", hand, SOLVED).data.components[3] as { description: string })
        .description;
    assert.match(question(PINFU), /discarder/);
    assert.match(question({ ...PINFU, winType: "tsumo" }), /non-dealer \/ dealer/);
    assert.match(question({ ...PINFU, winType: "tsumo", seatWind: "east" }), /each of the other three/);
  });
});

describe("answer receipt", () => {
  /** Riichi + pinfu + tanyao + 1 ura dora, non-dealer ron: 4 han 30 fu, 7700. */
  const RON: SolvedHand = {
    han: 4,
    fu: 30,
    ten: 7700,
    tsumoPayment: null,
    yaku: [
      { name: "Pinfu", han: 1 },
      { name: "Riichi", han: 1 },
      { name: "Tanyao", han: 1 },
      { name: "Ura dora", han: 1 },
    ],
    yakumanCount: 0,
    isDealer: false,
  };

  const grade = (overrides: Partial<AnswerGrade> = {}): AnswerGrade => ({
    han: true,
    fu: true,
    score: true,
    fuScored: true,
    correct: true,
    ...overrides,
  });

  const ANSWER = { han: 4, fu: 30, score: { kind: "total", value: 7700 } } as const;

  it("gives the answer to someone who got it right", () => {
    const receipt = buildAnswerReceipt(ANSWER, grade(), RON);
    assert.match(receipt, /All correct/);
    assert.match(receipt, /Correct answer: 4 han 30 fu · 7700/);
  });

  it("gives the same answer to someone who got it wrong", () => {
    const wrong = { han: 3, fu: 40, score: { kind: "total", value: 5200 } } as const;
    const receipt = buildAnswerReceipt(
      wrong,
      grade({ han: false, fu: false, score: false, correct: false }),
      RON
    );
    assert.match(receipt, /Not quite/);
    assert.match(receipt, /❌ {2}Han — you said \*\*3\*\*/);
    assert.match(receipt, /Correct answer: 4 han 30 fu · 7700/);
  });

  it("lists every yaku, so the han can be traced", () => {
    const receipt = buildAnswerReceipt(ANSWER, grade(), RON);
    for (const yaku of RON.yaku) {
      assert.ok(receipt.includes(`- ${yaku.name} — ${yaku.han} han`), `missing ${yaku.name}`);
    }
  });

  it("lists every fu line, so the fu can be traced the same way", () => {
    const explained: SolvedHand = {
      ...RON,
      fuBreakdown: [
        { name: "Base", fu: 20 },
        { name: "Closed hand, won by ron", fu: 10 },
        { name: "Ryanmen wait, 8 pin completing 678p", fu: 0 },
      ],
    };
    const receipt = buildAnswerReceipt(ANSWER, grade(), explained);
    assert.match(receipt, /__Han__/);
    assert.match(receipt, /__Fu__/);
    for (const line of explained.fuBreakdown ?? []) {
      assert.ok(receipt.includes(`- ${line.name} — ${line.fu} fu`), `missing ${line.name}`);
    }
    // The yaku come first, the fu after, under the one correct-answer line.
    assert.ok(receipt.indexOf("- Pinfu — 1 han") < receipt.indexOf("- Base — 20 fu"));
  });

  it("says nothing about fu for an answer stored without the lines", () => {
    const receipt = buildAnswerReceipt(ANSWER, grade(), RON);
    assert.doesNotMatch(receipt, /__Fu__/);
    assert.doesNotMatch(receipt, / fu$/m);
  });

  it("says which form the answer came through", () => {
    assert.match(buildAnswerReceipt(ANSWER, grade(), RON), /^Answer recorded\.$/m);
    assert.match(buildAnswerReceipt(ANSWER, grade(), RON, "typed"), /^Answer recorded\.$/m);
    assert.match(
      buildAnswerReceipt(ANSWER, grade(), RON, "beginner"),
      /^Answer recorded \(beginner form\)\.$/m
    );
  });

  it("writes a tsumo answer as the split, not just the total", () => {
    const tsumo: SolvedHand = {
      ...RON,
      ten: 12000,
      han: 5,
      fu: 40,
      isDealer: true,
      tsumoPayment: { kind: "all", each: 4000 },
    };
    const receipt = buildAnswerReceipt(ANSWER, grade({ fuScored: false }), tsumo);
    assert.match(receipt, /Correct answer: 5 han 40 fu · 4000 all \(12000 total\)/);
    assert.match(receipt, /Fu — not scored/);
  });

  it("asks them not to pass it on before the public reveal", () => {
    assert.match(buildAnswerReceipt(ANSWER, grade(), RON), /keep it to yourself/);
  });

  it("stays inside Discord's 2000 character message limit", () => {
    // Far more yaku than the 1–5 han band can produce, with the longest names,
    // and more fu lines than any hand has, with the longest of those.
    const crowded: SolvedHand = {
      ...RON,
      yaku: Array.from({ length: 13 }, () => ({ name: "Kokushimusou (13 sides)", han: 1 })),
      fuBreakdown: Array.from({ length: 12 }, () => ({
        name: "Triplet of White dragon, completed by ron so counted as open",
        fu: 4,
      })),
    };
    assert.ok(buildAnswerReceipt(ANSWER, grade(), crowded).length < 2000);
  });

  it("shows the answer again on a second submission", () => {
    const reply = buildAlreadyAnsweredReply(RON);
    assert.match(reply, /already answered/);
    assert.match(reply, /only your first answer counts/);
    assert.match(reply, /Correct answer: 4 han 30 fu · 7700/);
  });
});
