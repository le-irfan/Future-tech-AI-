const loginForm = document.getElementById("login-form");

if (loginForm) {
  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();

    const email = document.getElementById("login-email").value.trim().toLowerCase();
    const password = document.getElementById("login-password").value;

    const user = users().find(function (u) {
      return u.email === email && u.password === password;
    });

    if (!user) {
      show(" Wrong email or password.");
      return;
    }

    localStorage.setItem(SESSION_KEY, JSON.stringify({
      id: user.id,
      name: user.name,
      email: user.email
    }));

    show(" Login successful!");
    setTimeout(function () {
      location.href = "blog-ai.html";
    }, 500);
  });
}


const signupForm = document.getElementById("signup-form");

if (signupForm) {
  signupForm.addEventListener("submit", function (e) {
    e.preventDefault();

    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim().toLowerCase();
    const password = document.getElementById("signup-password").value;
    const confirm = document.getElementById("signup-confirm").value;

    if (!name || !email || !password || !confirm) {
      show(" Please fill in all fields.");
      return;
    }

    if (password.length < 6) {
      show("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirm) {
      show(" Passwords do not match.");
      return;
    }

    const list = users();

    if (list.some(function (u) { return u.email === email; })) {
      show(" Email already exists. Please log in.");
      return;
    }

    const user = {
      id: Date.now().toString(),
      name: name,
      email: email,
      password: password
    };

    list.push(user);
    saveUsers(list);

    localStorage.setItem(SESSION_KEY, JSON.stringify({
      id: user.id,
      name: user.name,
      email: user.email
    }));

    show(" Account created!");
    setTimeout(function () {
      location.href = "blog-ai.html";
    }, 500);
  });
}
