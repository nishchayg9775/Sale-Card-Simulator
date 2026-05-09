(function () {
  window.UCS_CONFIG = {
    bulkPresetLogoOptions: [
      {
        id: 'light',
        label: 'Light Logo ZIP',
        fileName: 'Light.zip',
        description: 'Use the bundled light-theme logo pack'
      },
      {
        id: 'dark',
        label: 'Dark Logo ZIP',
        fileName: 'Dark.zip',
        description: 'Use the bundled dark-theme logo pack'
      }
    ],
    bulkPresetSheetOptions: [
      {
        id: 'april22',
        label: 'sale data 22 April.xlsx',
        fileName: 'sale data 22 April.xlsx',
        description: 'Use the bundled sales sheet'
      }
    ],
    bannerSize: {
      outerW: 1440,
      outerH: 280,
      innerX: 64,
      innerY: 48,
      innerW: 1312,
      innerH: 219,
      innerRadius: 40
    },
    bannerTemplates: {
      'nifty-expiry': {
        label: 'Nifty Expiry Sale',
        kicker: 'NIFTY EXPIRY',
        headline: 'SALE',
        support: 'Premium market opportunity',
        accent: '#2f83ff',
        outerMode: 'gradient',
        outerColor: '#ffffff',
        outerGradStart: '#f6fbff',
        outerGradEnd: '#e8f3ff',
        prompt:
          'Premium homepage banner for a stock-market expiry sale. Create a high-end financial promo visual with a clean pale-blue inner card, a strong bullish sculpture on the left, a strong bearish sculpture on the right, glassy architecture or market skyline accents, soft cinematic lighting, and a clear central safe band for a text overlay. No text, no logos, no watermark, no UI frames. Keep the composition modern, premium, and uncluttered.'
      },
      'bull-bear': {
        label: 'Bull / Bear Market',
        kicker: 'BULL VS BEAR',
        headline: 'MARKET BATTLE',
        support: 'Momentum, contrast, and tension',
        accent: '#4aa7ff',
        outerMode: 'gradient',
        outerColor: '#ffffff',
        outerGradStart: '#ecf6ff',
        outerGradEnd: '#d7e8ff',
        prompt:
          'Premium financial banner artwork with a bullish figure on the left and a bearish figure on the right, dramatic blue lighting, clean central safe space, glossy finance-brand atmosphere, strong contrast, no text, no logos, no watermark, no interface chrome.'
      },
      'blue-market': {
        label: 'Blue Market Spotlight',
        kicker: 'MARKET SPOTLIGHT',
        headline: 'TOP SLOT',
        support: 'Polished, modern, and conversion focused',
        accent: '#3ab8ff',
        outerMode: 'solid',
        outerColor: '#f4f9ff',
        outerGradStart: '#f4f9ff',
        outerGradEnd: '#eaf4ff',
        prompt:
          'Modern blue finance banner background for a homepage top slot. Use a premium gradient, subtle architectural shapes, soft motion streaks, and a clean center band with balanced left-right visual weight. No text, no logos, no watermark, no UI frames.'
      }
    }
  };
})();
