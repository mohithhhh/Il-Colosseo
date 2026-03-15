export default function AudioProgress({ progress }) {
  return (
    <div
      id="audio-progress"
      style={{ width: `${progress}%` }}
    />
  );
}
