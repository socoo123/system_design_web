import MarkdownView from "./MarkdownView";

export default function Flashcards({ reviewMd }: { reviewMd: string }) {
  if (!reviewMd.trim()) return null;
  return <MarkdownView>{reviewMd}</MarkdownView>;
}
