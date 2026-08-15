/* ========== Tag creator : pilule "+" qui s'ouvre en input avec dropdown ========== */

.wp-tags.tag-container {
  position: relative;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-creator {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.wp-tag-chip.add-tag {
  background: var(--white);
  color: var(--ink);
  border: 1.5px dashed var(--border);
  font-weight: 600;
  font-size: 16px;
  width: 32px;
  height: 28px;
  padding: 0;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
  cursor: pointer;
  border-radius: 999px;
  transition: border-color .15s, background .15s;
}

.wp-tag-chip.add-tag:hover {
  border-color: var(--ink);
  background: var(--bg);
}

/* Dropdown de suggestions en temps réel */
.tag-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 100;
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  padding: 4px;
  min-width: 140px;
  max-height: 200px;
  overflow-y: auto;
}

.tag-dropdown button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 10px;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--ink);
  font-family: inherit;
}

.tag-dropdown button:hover {
  background: var(--bg);
}