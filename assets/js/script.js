// script.js
document.addEventListener("DOMContentLoaded", () => {
  const fadeIns = document.querySelectorAll('.fade-in');

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  fadeIns.forEach(section => {
    observer.observe(section);
    // Force-check visibility for elements already in view
    if (section.getBoundingClientRect().top < window.innerHeight) {
      section.classList.add('visible');
    }
  });

  const form = document.querySelector('form');
  const signal = document.querySelector('.signal-line');

  if (form && signal) {
    form.addEventListener('submit', (e) => {
      e.preventDefault(); // prevent actual submission for demonstration
      signal.classList.remove('animate');
      
      // Trigger reflow to restart animation
      void signal.offsetWidth;
      
      signal.classList.add('animate');

      // Optional: auto-reset the animation after it ends
      signal.addEventListener('animationend', () => {
        signal.classList.remove('animate');
      }, { once: true });

      // You can replace this with your real form submission logic or fetch
      // setTimeout(() => form.submit(), 500); // Uncomment to allow real submit
    });
  }
});