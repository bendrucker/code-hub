import { describe, expect, it } from "vitest";
import { boolean, integer, type LakeColumn, LakeValueError, text, timestamp } from "./columns";

describe("lake columns", () => {
  it.each<{ name: string; column: LakeColumn; value: unknown; expected: unknown }>([
    {
      name: "text keeps the string",
      column: text("title"),
      value: "a pull request",
      expected: "a pull request",
    },
    { name: "text keeps a null", column: text("description"), value: null, expected: null },
    { name: "integer keeps the number", column: integer("additions"), value: 345, expected: 345 },
    { name: "boolean reads 1 as true", column: boolean("is_fork"), value: 1, expected: true },
    { name: "boolean reads 0 as false", column: boolean("is_fork"), value: 0, expected: false },
    {
      name: "timestamp becomes the instant the string named",
      column: timestamp("created_at"),
      value: "2026-09-09T16:30:00Z",
      expected: new Date("2026-09-09T16:30:00Z"),
    },
    { name: "timestamp keeps a null", column: timestamp("merged_at"), value: null, expected: null },
  ])("$name", ({ column, value, expected }) => {
    expect(column.cell(value)).toEqual(expected);
  });

  it.each<{ name: string; column: LakeColumn; value: unknown }>([
    { name: "text given a number", column: text("title"), value: 7 },
    { name: "integer given a string", column: integer("additions"), value: "345" },
    { name: "boolean given something other than 0 or 1", column: boolean("is_fork"), value: 2 },
    { name: "timestamp given a number", column: timestamp("created_at"), value: 1_757_000_000 },
    {
      name: "timestamp given an unparseable string",
      column: timestamp("created_at"),
      value: "soon",
    },
  ])("names the column when $name", ({ column, value }) => {
    expect(() => column.cell(value)).toThrow(LakeValueError);
    expect(() => column.cell(value)).toThrow(column.name);
  });
});
