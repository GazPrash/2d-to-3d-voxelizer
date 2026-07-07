// pre-calculated bg
const generateStaticBackground = () => {
  const width = 3840;
  const height = 2160;
  
  const diag = Math.sqrt(width * width + height * height);
  const startX = -diag / 2;
  const endX = width + diag / 2;
  const startY = -diag / 2;
  const endY = height + diag / 2;

  let rects = '';
  const heights = [20, 32, 48, 64, 96, 128, 500];
  
  for (let x = startX; x < endX; x += 18) {
    let y = startY;
    while (y < endY) {
      const hash = Math.abs(Math.sin(x * 12.9898 + y * 78.233)) * 43758.5453;
      const hIndex = Math.floor(hash) % heights.length;
      const h = heights[hIndex];
      
      rects += `<rect x="${Math.round(x)}" y="${Math.round(y)}" width="10" height="${h}" rx="5"/>`;
      
      const gapHash = Math.abs(Math.cos(x * 4.141 + y * 9.221)) * 12345.67;
      const gap = 4 + (Math.floor(gapHash) % 10);
      y += h + gap;
    }
  }

  const svgString = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <g fill="rgba(148, 163, 184, 0.35)" transform="rotate(45 ${width/2} ${height/2})">
      ${rects}
    </g>
  </svg>`;

  return `url("data:image/svg+xml,${encodeURIComponent(svgString)}")`;
};

const STATIC_BG_URL = generateStaticBackground();

const BackgroundTexture = () => {
  return (
    <div 
      style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '100%', 
        pointerEvents: 'none',
        backgroundColor: '#e2e8f0',
        backgroundImage: STATIC_BG_URL,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center center'
      }} 
    />
  );
};

export default BackgroundTexture;
