// const navEl = document.querySelector('.navbar');

// window.addEventListener('scroll', () => {
//     if (window.scrollY > 50) {
//         // Set the sliding panel color to match info theme
//         navEl.style.setProperty('--navbar-slide-bg', getComputedStyle(document.documentElement).getPropertyValue('--bs-light'));
//         navEl.classList.add('navbar-scrolled');
//         navEl.classList.remove('navbar-theme-transparent');
//         navEl.classList.add('navbar-theme-info');
//     } else {
//         navEl.classList.remove('navbar-scrolled');
//         navEl.classList.remove('navbar-theme-info');
//         navEl.classList.add('navbar-theme-transparent');
//     }
// });

const navEl = document.querySelector('.navbar');


window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    if (currentScrollY > 50) {
        navEl.classList.add('navbar-theme-info');
    } else {
        navEl.classList.remove('navbar-theme-info');
    }

   
    // if (window.scrollY < 56) {
    //     navEl.classList.remove('navbar-theme-info');
    // } else {
    //     navEl.classList.add('navbar-theme-info');
    // }
});