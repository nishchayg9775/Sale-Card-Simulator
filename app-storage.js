(function () {
  function getText(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value == null ? fallback : value;
    } catch (err) {
      return fallback;
    }
  }

  function setText(key, value) {
    try {
      localStorage.setItem(key, String(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function getJson(key, fallback) {
    const raw = getText(key, null);
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  function setJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (err) {
      return false;
    }
  }

  window.UCS_STORAGE = {
    getText,
    setText,
    getJson,
    setJson,
    remove
  };
})();
