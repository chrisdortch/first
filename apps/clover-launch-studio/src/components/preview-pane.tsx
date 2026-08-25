export function PreviewPane() {
  return (
    <div className="preview-frame" role="status" aria-live="polite">
      <div>
        <strong>Preview unavailable</strong>
        <p>A target-null preview requires a later, separate validation and preview gate. No deployment is implied by this source candidate.</p>
      </div>
    </div>
  );
}
