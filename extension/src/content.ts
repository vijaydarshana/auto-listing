import type { CapturedField } from './types';

console.log('Auto Listing AI content script loaded');

let captureMode = false;
let capturedFields: CapturedField[] = [];
let autofillRunning = false;
let autofillRunId = 0;

const LIVE_FIELDS_KEY = 'auto_listing_live_fields';


// ============================================================
// MESSAGE HANDLER
// ============================================================

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender,
    sendResponse
  ) => {

    // --------------------------------------------------------
    // START CAPTURE
    // --------------------------------------------------------

    if (message.type === 'START_CAPTURE') {

      startCapture();

      sendResponse({
        success: true,
        fields: capturedFields,
      });

      return true;
    }


    // --------------------------------------------------------
    // STOP CAPTURE
    // --------------------------------------------------------

    if (message.type === 'STOP_CAPTURE') {

      stopCapture();

      sendResponse({
        success: true,
        fields: capturedFields,
      });

      return true;
    }


    if (message.type === 'STOP_AUTOFILL') {
      stopAutofill();
      sendResponse({ success: true });
      return true;
    }


    // --------------------------------------------------------
    // AUTOFILL
    // --------------------------------------------------------

    if (message.type === 'AUTOFILL') {

      console.log(
        '🚀 AUTOFILL REQUEST RECEIVED',
        message.fields
      );

      void autofill(
        message.fields ?? [],
        message.selectedSize
      );

      sendResponse({
        success: true,
      });

      return true;
    }

  }
);


// ============================================================
// START CAPTURE
// ============================================================

function startCapture() {
  document.removeEventListener('input', handleInput, true);
  document.removeEventListener('change', handleChange, true);
  document.removeEventListener('click', handleClick, true);

  captureMode = true;

  document.getElementById('auto-listing-save-capture-panel')?.remove();

  capturedFields = [];

  console.log(
    '🔴 LIVE CAPTURE STARTED'
  );

  document.addEventListener(
    'input',
    handleInput,
    true
  );

  document.addEventListener(
    'change',
    handleChange,
    true
  );

  document.addEventListener(
    'click',
    handleClick,
    true
  );

  showCaptureIndicator();

  saveLiveFields();
}


// ============================================================
// STOP CAPTURE
// ============================================================

function stopCapture() {

  captureMode = false;

  document.removeEventListener(
    'input',
    handleInput,
    true
  );

  document.removeEventListener(
    'change',
    handleChange,
    true
  );

  document.removeEventListener(
    'click',
    handleClick,
    true
  );

  removeCaptureIndicator();

  console.log(
    '🟢 CAPTURE COMPLETE',
    capturedFields
  );

  void saveLiveFields();

  chrome.runtime.sendMessage({
    type: 'CAPTURE_COMPLETE',
    fields: capturedFields,
  });

  showCapturedSavePanel();
}


// ============================================================
// INPUT CAPTURE
// ============================================================

function handleInput(
  event: Event
) {

  if (!captureMode) {
    return;
  }

  const element =
    event.target as HTMLElement | null;

  if (!element) {
    return;
  }

  if (!isFormElement(element)) {
    return;
  }

  captureElement(element);
}


// ============================================================
// CHANGE CAPTURE
// ============================================================

function handleChange(
  event: Event
) {

  if (!captureMode) {
    return;
  }

  const element =
    event.target as HTMLElement | null;

  if (!element) {
    return;
  }

  if (!isFormElement(element)) {
    return;
  }

  captureElement(element);
}


// ============================================================
// CLICK CAPTURE
// ============================================================

function handleClick(
  event: MouseEvent
) {

  if (!captureMode) {
    return;
  }

  const target =
    event.target as HTMLElement | null;

  if (!target) {
    return;
  }


  // ----------------------------------------------------------
  // Native select
  // ----------------------------------------------------------

  if (
    target instanceof HTMLSelectElement
  ) {

    captureElement(target);

    return;
  }


  // ----------------------------------------------------------
  // Check if clicked element is an option
  // ----------------------------------------------------------

  const option =
    findClickedOption(target);

  if (option) {

    const value =
      getOptionText(option);

    if (value) {

      captureCustomElement(
        option,
        value
      );

    }

    return;
  }


  // ----------------------------------------------------------
  // Yes / No / radio style controls
  // ----------------------------------------------------------

  const radioValue =
    findRadioValue(target);

  if (radioValue) {

    captureCustomElement(
      target,
      radioValue
    );

    return;
  }
}


// ============================================================
// FORM ELEMENT CHECK
// ============================================================

function isFormElement(
  element: HTMLElement
): boolean {

  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  );
}


// ============================================================
// CAPTURE NORMAL ELEMENT
// ============================================================

function captureElement(
  element: HTMLElement
) {

  const value =
    getElementValue(element);

  if (!value) {
    return;
  }

  const selector =
    generateSelector(element);

  const field: CapturedField = {

    id: selector,

    name:
      element.getAttribute('name') ||
      element.getAttribute('placeholder') ||
      element.getAttribute('aria-label') ||
      getLabel(element) ||
      getNearbyLabel(element) ||
      'Unknown Field',

    value,

    selector,

    tagName:
      element.tagName.toLowerCase(),

    type:
      element.getAttribute('type') ||
      '',

    placeholder:
      element.getAttribute('placeholder') ||
      '',

    label:
      getLabel(element),
  };


  updateCapturedField(field);
  showFieldStatus(field, 'captured');
}


// ============================================================
// CAPTURE CUSTOM ELEMENT
// ============================================================

function isTemporarySearchInput(element: HTMLElement): boolean {
  if (!(element instanceof HTMLInputElement)) return false;
  const name = normalizeText(element.getAttribute('name') || '');
  const placeholder = normalizeText(element.getAttribute('placeholder') || '');
  return name === 'search' || placeholder === 'search';
}

function findOwningControl(option: HTMLElement): HTMLElement | null {
  // IMPORTANT: Never use the previous dropdown as the owner of a new option.
  // Meesho renders dropdown menus in a portal, so each popup must resolve
  // back to the dropdown that opened THAT popup.
  const listbox = option.closest<HTMLElement>('[role="listbox"], .MuiPopover-root, .MuiMenu-root');
  if (listbox) {
    const labelledBy = listbox.getAttribute('aria-labelledby');
    if (labelledBy) {
      const label = document.getElementById(labelledBy);
      const owner = label?.closest<HTMLElement>('.MuiFormControl-root, [role="group"], [role="radiogroup"]');
      if (owner) return owner.querySelector<HTMLElement>('[role="combobox"], [aria-haspopup="listbox"], input, button') || owner;
    }
    const popupId = listbox.id;
    if (popupId) {
      const opener = document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(popupId)}"]`);
      if (opener) return opener;
    }
  }
  return option.closest<HTMLElement>('[role="combobox"], [aria-haspopup="listbox"], .MuiFormControl-root') || null;
}

function generateStableControlSelector(element: HTMLElement): string {
  const name = element.getAttribute('name');
  if (name) return `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
  if (element.id) return `#${CSS.escape(element.id)}`;
  const testId = element.getAttribute('data-testid');
  if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
  const aria = element.getAttribute('aria-label');
  if (aria) return `${element.tagName.toLowerCase()}[aria-label="${CSS.escape(aria)}"]`;
  
  // For custom dropdowns, the selector will be based on DOM structure.
  // Uniqueness is ensured by also checking field name in updateCapturedField.
  return generateSelector(element);
}

function captureCustomElement(element: HTMLElement, value: string) {
  if (!value || isTemporarySearchInput(element)) return;

  const owner = findOwningControl(element) || element;
  if (isTemporarySearchInput(owner)) return;

  const selector = generateStableControlSelector(owner);

  const name =
    getDropdownLabel(owner) ||
    findCustomFieldName(owner) ||
    owner.getAttribute('aria-label') ||
    owner.getAttribute('name') ||
    getNearbyLabel(owner) ||
    findCustomFieldName(element) ||
    getNearbyLabel(element) ||
    'Unknown Field';

  const field: CapturedField = {
    id: selector,
    name,
    value: value.trim(),
    selector,
    tagName: owner.tagName.toLowerCase(),
    type: owner.getAttribute('type') || '',
    placeholder: owner.getAttribute('placeholder') || '',
    label: getNearbyLabel(owner) || getNearbyLabel(element),
  };

  updateCapturedField(field);
  showFieldStatus(field, 'captured');
}

function getDropdownLabel(element: HTMLElement): string {
  const form = element.closest<HTMLElement>(
    '.MuiFormControl-root, [role="group"], [role="radiogroup"]'
  );

  if (!form) return '';

  const label = form.querySelector<HTMLElement>(
    'label, .MuiFormLabel-root'
  );

  return label?.textContent?.trim() || '';
}

// ============================================================
// UPDATE CAPTURED FIELD
// ============================================================

function updateCapturedField(
  field: CapturedField
) {
  // Use selector + name to identify uniqueness.
  // This handles cases where multiple dropdowns may have similar selectors
  // but different labels/names (e.g., category vs. yes/no fields).
  const existingIndex = capturedFields.findIndex(
    item => item.selector === field.selector && normalizeText(item.name) === normalizeText(field.name)
  );

  if (existingIndex >= 0) {
    // Update existing field with same selector AND name
    capturedFields[existingIndex] = field;
  } else {
    // New field: different selector or name
    capturedFields.push(field);
  }

  console.log(
    '📌 Captured:',
    field.name,
    '=',
    field.value
  );

  void saveLiveFields();

  chrome.runtime.sendMessage({
    type: 'CAPTURE_UPDATE',
    fields: capturedFields,
  });
}

// ============================================================
// ELEMENT VALUE
// ============================================================

function getElementValue(
  element: HTMLElement
): string {

  // SELECT
  if (
    element instanceof HTMLSelectElement
  ) {

    const option =
      element.options[
        element.selectedIndex
      ];

    return option
      ? option.textContent?.trim() ||
        element.value
      : element.value;
  }


  // INPUT / TEXTAREA
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {

    return element.value.trim();
  }


  return '';
}


// ============================================================
// LABEL
// ============================================================

function getLabel(
  element: HTMLElement
): string {

  if (!element.id) {
    return '';
  }

  const label =
    document.querySelector(
      `label[for="${CSS.escape(
        element.id
      )}"]`
    );

  return label
    ? label.textContent?.trim() || ''
    : '';
}


// ============================================================
// NEARBY LABEL
// ============================================================

function getNearbyLabel(
  element: HTMLElement
): string {

  const parent =
    element.parentElement;

  if (!parent) {
    return '';
  }

  const text =
    parent.innerText?.trim() || '';

  if (
    text &&
    text.length < 150
  ) {

    return text;
  }

  return '';
}


// ============================================================
// CUSTOM FIELD NAME
// ============================================================

function findCustomFieldName(
  element: HTMLElement
): string {

  const parent =
    element.closest(
      '[role="radiogroup"],' +
      '[role="group"],' +
      '.MuiFormControl-root'
    );

  if (!parent) {
    return '';
  }

  const label =
    parent.querySelector(
      'label,' +
      '.MuiFormLabel-root,' +
      '[class*="label"]'
    );

  return label
    ? label.textContent?.trim() || ''
    : '';
}


// ============================================================
// FIND CLICKED OPTION
// ============================================================

function findClickedOption(
  target: HTMLElement
): HTMLElement | null {

  const direct =
    target.closest<HTMLElement>(
      '[role="option"]'
    );

  if (direct) {
    return direct;
  }


  const option =
    target.closest<HTMLElement>(
      '[data-value],' +
      '[data-option]'
    );

  if (option) {
    return option;
  }


  const listItem =
    target.closest<HTMLElement>('li');

  if (listItem) {
    return listItem;
  }


  // MUI Typography <p>Yes</p>
  if (
    target.tagName.toLowerCase() === 'p' ||
    target.tagName.toLowerCase() === 'span'
  ) {

    const text =
      target.textContent?.trim();

    if (text) {

      const parent =
        target.parentElement;

      if (
        parent &&
        (
          parent.tagName.toLowerCase() === 'li' ||
          parent.getAttribute('role') === 'option' ||
          parent.getAttribute('role') === 'radio' ||
          parent.closest('[role="listbox"], .MuiPopover-root, .MuiMenu-root')
        )
      ) {
        return parent;
      }

      if (
        target.closest('[role="listbox"], .MuiPopover-root, .MuiMenu-root')
      ) {
        return target;
      }

      return null;
    }
  }


  return null;
}


// ============================================================
// OPTION TEXT
// ============================================================

function getOptionText(
  element: HTMLElement
): string {

  const dataValue =
    element.getAttribute(
      'data-value'
    );

  if (dataValue) {
    return dataValue.trim();
  }

  const text =
    element.innerText ||
    element.textContent ||
    '';

  return text.trim();
}


// ============================================================
// RADIO VALUE
// ============================================================

function findRadioValue(
  element: HTMLElement
): string {

  const role =
    element.getAttribute('role');

  if (
    role === 'radio' ||
    role === 'option'
  ) {

    return getOptionText(element);
  }


  const parent =
    element.closest<HTMLElement>(
      '[role="radio"], [role="option"]'
    );

  if (parent) {
    return getOptionText(parent);
  }


  const text =
    element.innerText?.trim() ||
    element.textContent?.trim() ||
    '';


  if (
    text === 'Yes' ||
    text === 'No'
  ) {

    return text;
  }


  return '';
}


// ============================================================
// GENERATE SELECTOR
// ============================================================

function generateSelector(
  element: HTMLElement
): string {

  // ID
  if (element.id) {

    return `#${CSS.escape(
      element.id
    )}`;
  }


  // NAME
  const name =
    element.getAttribute('name');

  if (name) {

    const escapedName =
      CSS.escape(name);

    return `${element.tagName.toLowerCase()}[name="${escapedName}"]`;
  }


  // DATA TEST ID
  const testId =
    element.getAttribute(
      'data-testid'
    );

  if (testId) {

    return `[data-testid="${CSS.escape(
      testId
    )}"]`;
  }


  // ARIA LABEL
  const aria =
    element.getAttribute(
      'aria-label'
    );

  if (aria) {

    return `${element.tagName.toLowerCase()}[aria-label="${CSS.escape(
      aria
    )}"]`;
  }


  // CLASS BASED
  const classes =
    Array.from(
      element.classList
    )
      .filter(
        className =>
          !className.startsWith(
            'css-'
          )
      )
      .slice(0, 2);


  if (classes.length > 0) {

    return (
      element.tagName.toLowerCase() +
      classes
        .map(
          className =>
            `.${CSS.escape(
              className
            )}`
        )
        .join('')
    );
  }


  // DOM PATH
  const path: string[] = [];

  let current:
    HTMLElement | null = element;

  while (
    current &&
    current !== document.body
  ) {

    let selector =
      current.tagName.toLowerCase();

    const parent =
      current.parentElement;

    if (parent) {

      const siblings =
        Array.from(
          parent.children
        ).filter(
          child =>
            child.tagName ===
            current!.tagName
        );

      if (siblings.length > 1) {

        const index =
          siblings.indexOf(
            current
          ) + 1;

        selector += `:nth-of-type(${index})`;
      }
    }

    path.unshift(selector);

    current =
      current.parentElement;
  }

  return path.join(' > ');
}


// ============================================================
// SAVE LIVE FIELDS
// ============================================================

async function saveLiveFields() {

  try {

    await chrome.storage.local.set({
      [LIVE_FIELDS_KEY]:
        capturedFields,
    });

  } catch (error) {

    console.error(
      'Could not save live fields:',
      error
    );
  }
}


// ============================================================
// AUTOFILL
// ============================================================

function stopAutofill() {
  autofillRunId++;
  autofillRunning = false;
  console.log('⏹️ AUTOFILL STOPPED');
}

async function autofill(fields: CapturedField[], selectedSize?: string) {
  if (!Array.isArray(fields)) return;
  const runId = ++autofillRunId;
  autofillRunning = true;
  let successCount = 0;
  console.log('🚀 AUTOFILL STARTED', fields);

  for (const field of fields) {
    if (!autofillRunning || runId !== autofillRunId) return;

    try {

      const value = /(^|[^a-z])size([^a-z]|$)/i.test(`${field.name} ${field.selector}`) && selectedSize ? selectedSize : field.value;
      const success = await fillField(field, value);
      
      if (!autofillRunning || runId !== autofillRunId) return;
      
      if (success) {
        successCount++;
        console.log(`✅ Filled: ${field.name} = ${value}`);
        showFieldStatus(field, 'filled');
      } else {
        console.warn(`❌ Could not fill: ${field.name} = ${value}`);
      }

    } catch (error) {

      console.error(`Error processing field ${field.name}:`, error);
    }

    await sleep(800);
  }

  if (!autofillRunning || runId !== autofillRunId) return;
  autofillRunning = false;
  console.log(`🎉 AUTOFILL COMPLETE: ${successCount}/${fields.length}`);
  chrome.runtime.sendMessage({ type: 'AUTOFILL_COMPLETE', successCount, totalCount: fields.length });
}

// ============================================================
// FILL FIELD
// ============================================================

async function fillField(
  field: CapturedField,
  value: string
): Promise<boolean> {

  try {

    let element:
      HTMLElement | null = null;


    // ----------------------------------------------------------
    // ORIGINAL SELECTOR
    // ----------------------------------------------------------

    try {

      element =
        document.querySelector<HTMLElement>(
          field.selector
        );

    } catch {
      console.warn(
        'Invalid selector:',
        field.selector
      );
    }


    // ----------------------------------------------------------
    // NATIVE FORM ELEMENT
    // ----------------------------------------------------------

    if (
      element instanceof
        HTMLInputElement ||
      element instanceof
        HTMLTextAreaElement ||
      element instanceof
        HTMLSelectElement
    ) {

      setNativeValue(
        element,
        value
      );

      return true;
    }


    // ----------------------------------------------------------
    // CUSTOM CONTROL
    // ----------------------------------------------------------

    if (element) {

      try {

        const result =
          await fillCustomControl(
            element,
            value
          );

        if (result) {
          return true;
        }

      } catch (error) {

        console.error(
          'Error filling custom control:',
          error
        );
      }
    }


    // ----------------------------------------------------------
    // FIND BY FIELD NAME
    // ----------------------------------------------------------

    const control =
      findControlByName(
        field.name
      );


    if (control) {

      if (
        control instanceof
          HTMLInputElement ||
        control instanceof
          HTMLTextAreaElement ||
        control instanceof
          HTMLSelectElement
      ) {

        setNativeValue(
          control,
          value
        );

        return true;
      }


      try {

        const result =
          await fillCustomControl(
            control,
            value
          );

        if (result) {
          return true;
        }

      } catch (error) {

        console.error(
          'Error filling control by name:',
          error
        );
      }
    }


    // ----------------------------------------------------------
    // SEARCH VISIBLE OPTION
    // ----------------------------------------------------------

    const option =
      findVisibleTextOption(
        value
      );


    if (option) {

      clickOption(
        option
      );

      return true;
    }


    return false;

  } catch (error) {

    console.error(
      'Unexpected error in fillField:',
      error
    );

    return false;
  }
}


// ============================================================
// CUSTOM CONTROL
// ============================================================

async function fillCustomControl(
  control: HTMLElement,
  value: string
): Promise<boolean> {

  try {

    console.log(
      '🖱️ Custom control:',
      control,
      '→',
      value
    );


    // ----------------------------------------------------------
    // Already an option?
    // ----------------------------------------------------------

    const controlText =
      control.innerText?.trim() ||
      control.textContent?.trim() ||
      '';


    if (
      controlText.toLowerCase() ===
      value.trim().toLowerCase()
    ) {

      clickOption(control);

      await sleep(250);

      return true;
    }


    // ----------------------------------------------------------
    // Open control
    // ----------------------------------------------------------

    try {

      control.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });

    } catch (error) {
      console.debug('Could not scroll captured control into view:', error);
    }


    await sleep(150);


    try {

      control.click();

    } catch (error) {

      console.error('Could not click control:', error);
      return false;
    }


    // ----------------------------------------------------------
    // Wait for dropdown to open and render
    // ----------------------------------------------------------

    await sleep(600);


    // ----------------------------------------------------------
    // Find option with retry
    // ----------------------------------------------------------

    let option: HTMLElement | null = null;
    let retries = 3;

    while (!option && retries > 0) {

      try {

        option =
          findVisibleTextOption(
            value
          );

      } catch (error) {

        console.error('Error finding visible text option:', error);
      }

      if (!option) {

        console.warn(
          `Option not found (retry ${4 - retries}/3): ${value}`
        );

        await sleep(300);

        retries--;
      }
    }

    if (!option) {

      console.warn(
        `Option could not be found after retries: ${value}`
      );

      // Try to close dropdown by clicking control again
      try {
        control.click();
      } catch {
        // ignore
      }

      return false;
    }


    // ----------------------------------------------------------
    // Click option
    // ----------------------------------------------------------

    clickOption(option);

    await sleep(500);

    return true;

  } catch (error) {

    console.error('Unexpected error in fillCustomControl:', error);
    return false;
  }
}


// ============================================================
// CLICK OPTION
// ============================================================

function clickOption(
  element: HTMLElement
) {

  try {

    const clickable =
      element.closest<HTMLElement>(
        '[role="option"],' +
        '[role="radio"],' +
        '[role="menuitem"],' +
        'li,' +
        'button'
      ) || element;


    console.log(
      '🖱️ Clicking:',
      clickable
    );


    clickable.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });


    clickable.dispatchEvent(
      new MouseEvent(
        'mousedown',
        {
          bubbles: true,
          cancelable: true,
          view: window,
        }
      )
    );


    clickable.dispatchEvent(
      new MouseEvent(
        'mouseup',
        {
          bubbles: true,
          cancelable: true,
          view: window,
        }
      )
    );


    clickable.click();

  } catch (error) {

    console.error('Error clicking option:', error);
  }
}


// ============================================================
// FIND VISIBLE TEXT
// ============================================================

function findVisibleTextOption(
  value: string
): HTMLElement | null {

  const wanted =
    normalizeText(value);


  if (!wanted) {
    return null;
  }


  const elements =
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '[role="option"],' +
        '[role="radio"],' +
        '[role="menuitem"],' +
        'li,' +
        'button,' +
        'p,' +
        'span,' +
        '[data-value],' +
        '[data-option]'
      )
    );


  // ----------------------------------------------------------
  // Exact match
  // ----------------------------------------------------------

  for (
    const element of elements
  ) {

    if (
      !isVisible(element)
    ) {
      continue;
    }


    const text =
      normalizeText(
        element.innerText ||
        element.textContent ||
        ''
      );


    if (
      text === wanted
    ) {

      return element;
    }
  }


  // ----------------------------------------------------------
  // data-value match
  // ----------------------------------------------------------

  for (
    const element of elements
  ) {

    if (
      !isVisible(element)
    ) {
      continue;
    }


    const dataValue =
      normalizeText(
        element.getAttribute(
          'data-value'
        ) || ''
      );


    if (
      dataValue === wanted
    ) {

      return element;
    }
  }


  return null;
}


// ============================================================
// FIND CONTROL BY NAME
// ============================================================

function findControlByName(
  name: string
): HTMLElement | null {

  const wanted =
    normalizeText(name);


  if (!wanted) {
    return null;
  }


  const controls =
    Array.from(
      document.querySelectorAll<HTMLElement>(
        'input,' +
        'textarea,' +
        'select,' +
        '[role="combobox"],' +
        '[aria-haspopup="listbox"],' +
        'button,' +
        '[role="radio"]'
      )
    );


  // Exact-ish name match
  for (
    const element of controls
  ) {

    const text = normalizeText(
      [
        element.getAttribute(
          'name'
        ),

        element.getAttribute(
          'aria-label'
        ),

        element.getAttribute(
          'placeholder'
        ),

        element.innerText,
      ]
        .filter(Boolean)
        .join(' ')
    );


    if (
      text === wanted ||
      text.includes(wanted) ||
      wanted.includes(text)
    ) {

      return element;
    }
  }


  return null;
}


// ============================================================
// SET NATIVE VALUE
// ============================================================

function setNativeValue(
  element:
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement,
  value: string
) {

  // FILE INPUT - Cannot be set programmatically for security
  if (
    element instanceof
    HTMLInputElement &&
    element.type === 'file'
  ) {

    console.warn(
      'Cannot set value on file input for security reasons:',
      element
    );

    return;
  }


  // SELECT
  if (
    element instanceof
    HTMLSelectElement
  ) {

    const wanted =
      normalizeText(value);


    let found =
      Array.from(
        element.options
      ).find(
        option =>
          normalizeText(
            option.textContent ||
            ''
          ) === wanted
      );


    if (!found) {

      found =
        Array.from(
          element.options
        ).find(
          option =>
            normalizeText(
              option.value
            ) === wanted
        );
    }


    if (found) {

      element.value =
        found.value;

    } else {

      element.value =
        value;
    }


    element.dispatchEvent(
      new Event(
        'change',
        {
          bubbles: true,
        }
      )
    );


    return;
  }


  // INPUT / TEXTAREA
  const prototype =
    Object.getPrototypeOf(
      element
    );


  const descriptor =
    Object.getOwnPropertyDescriptor(
      prototype,
      'value'
    );


  descriptor?.set?.call(
    element,
    value
  );


  element.dispatchEvent(
    new Event(
      'input',
      {
        bubbles: true,
      }
    )
  );


  element.dispatchEvent(
    new Event(
      'change',
      {
        bubbles: true,
      }
    )
  );


  element.dispatchEvent(
    new Event(
      'blur',
      {
        bubbles: true,
      }
    )
  );
}


// ============================================================
// NORMALIZE TEXT
// ============================================================

function normalizeText(
  value: string
): string {

  return value
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
    .toLowerCase();
}


// ============================================================
// VISIBILITY
// ============================================================

function isVisible(
  element: HTMLElement
): boolean {

  const style =
    window.getComputedStyle(
      element
    );


  const rect =
    element.getBoundingClientRect();


  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    Number(
      style.opacity
    ) !== 0 &&
    rect.width > 0 &&
    rect.height > 0
  );
}


// ============================================================
// SLEEP
// ============================================================

function sleep(
  milliseconds: number
): Promise<void> {

  return new Promise(
    resolve =>
      window.setTimeout(
        resolve,
        milliseconds
      )
  );
}


function showFieldStatus(field: CapturedField, status: 'captured' | 'filled') {
  document.querySelectorAll<HTMLElement>('[data-auto-listing-status]').forEach((node) => {
    if (node.dataset.autoListingSelector === field.selector) node.remove();
  });
  let element: HTMLElement | null = null;
  try { element = document.querySelector<HTMLElement>(field.selector); } catch { element = null; }
  if (!element) element = findControlByName(field.name);
  if (!element) return;
  const badge = document.createElement('span');
  badge.dataset.autoListingStatus = status;
  badge.dataset.autoListingSelector = field.selector;
  badge.textContent = status === 'captured' ? '● Captured' : '✓ Filled';
  Object.assign(badge.style, { display:'inline-flex', alignItems:'center', marginLeft:'8px', padding:'3px 8px', borderRadius:'999px', background: status === 'captured' ? '#fff3cd' : '#e8f5e9', color: status === 'captured' ? '#8a5a00' : '#1b5e20', border:`1px solid ${status === 'captured' ? '#f0c36d' : '#81c784'}`, font:'600 12px/1.2 Arial,sans-serif', position:'relative', zIndex:'2147483646' });
  (element.parentElement || document.body).appendChild(badge);
}

// ============================================================
// SAVE CAPTURED FIELDS
// ============================================================

function showCapturedSavePanel() {
  document.getElementById('auto-listing-save-capture-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'auto-listing-save-capture-panel';

  Object.assign(panel.style, {
    position: 'fixed',
    top: '15px',
    right: '15px',
    zIndex: '2147483647',
    background: '#fff',
    color: '#222',
    padding: '14px',
    borderRadius: '10px',
    boxShadow: '0 4px 18px rgba(0,0,0,.22)',
    border: '1px solid #ddd',
    font: '14px Arial,sans-serif',
    minWidth: '235px',
  });

  const title = document.createElement('div');
  title.textContent = `${capturedFields.length} field${capturedFields.length === 1 ? '' : 's'} captured`;
  title.style.fontWeight = '700';
  title.style.marginBottom = '10px';

  const save = document.createElement('button');
  save.type = 'button';
  save.textContent = '💾 Save Captured Fields';

  Object.assign(save.style, {
    width: '100%',
    border: '0',
    borderRadius: '7px',
    padding: '10px',
    cursor: 'pointer',
    background: '#1976d2',
    color: '#fff',
    fontWeight: '700',
  });

  save.addEventListener('click', async () => {
    save.disabled = true;
    save.textContent = 'Saving...';

    try {
      await chrome.storage.local.set({
        [LIVE_FIELDS_KEY]: capturedFields,
      });

      chrome.runtime.sendMessage({
        type: 'CAPTURE_COMPLETE',
        fields: capturedFields,
      });

      save.textContent = '✓ Saved';
      save.style.background = '#2e7d32';

      window.setTimeout(() => panel.remove(), 1200);
    } catch (error) {
      console.error('Could not save captured fields:', error);
      save.disabled = false;
      save.textContent = 'Retry Save';
      save.style.background = '#c62828';
    }
  });

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';

  Object.assign(close.style, {
    position: 'absolute',
    top: '4px',
    right: '7px',
    border: '0',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '18px',
    color: '#666',
  });

  close.addEventListener('click', () => panel.remove());

  panel.appendChild(close);
  panel.appendChild(title);
  panel.appendChild(save);
  document.body.appendChild(panel);
}

// ============================================================
// CAPTURE INDICATOR
// ============================================================

function showCaptureIndicator() {

  if (
    document.getElementById(
      'auto-listing-capture-indicator'
    )
  ) {
    return;
  }


  const indicator =
    document.createElement(
      'div'
    );


  indicator.id =
    'auto-listing-capture-indicator';


  indicator.textContent =
    '🔴 LIVE CAPTURE';


  Object.assign(
    indicator.style,
    {
      position: 'fixed',
      top: '15px',
      right: '15px',
      zIndex: '2147483647',
      background: '#d32f2f',
      color: '#fff',
      padding: '10px 16px',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '700',
      fontFamily:
        'Arial, sans-serif',
      boxShadow:
        '0 4px 12px rgba(0,0,0,.25)',
    }
  );


  document.body.appendChild(
    indicator
  );
}


// ============================================================
// REMOVE CAPTURE INDICATOR
// ============================================================

function removeCaptureIndicator() {

  const indicator =
    document.getElementById(
      'auto-listing-capture-indicator'
    );


  indicator?.remove();
}