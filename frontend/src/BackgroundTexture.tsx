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
        backgroundImage: `
          repeating-linear-gradient(
            45deg,
            transparent,
            transparent 8px,
            #cdd5e0 8px,
            #cdd5e0 16px
          )
        `,
      }}
    />
  );
};

export default BackgroundTexture;
