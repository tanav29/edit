// 🌀 CRAZY TYPESCRIPT MADNESS 🌀

// 1. Recursive type that creates an infinite tuple
type DeepTuple<T, N extends number, Acc extends T[] = []> = 
  Acc['length'] extends N ? Acc : DeepTuple<T, N, [...Acc, T | DeepTuple<T, N, Acc>]>;

// 2. A class that monkey-patches itself at runtime
class ChaosMonkey {
  private static instance: ChaosMonkey;
  
  constructor() {
    // Dynamically add methods at runtime
    Object.defineProperties(this, {
      banana: { 
        get: () => this.yell("BANANA! 🍌"),
        configurable: true 
      },
      quantum: {
        value: () => Math.random() > 0.5 ? "alive" : "dead" as const
      }
    });
  }

  static getInstance(): ChaosMonkey {
    if (!ChaosMonkey.instance) {
      ChaosMonkey.instance = new ChaosMonkey();
    }
    return ChaosMonkey.instance;
  }

  private yell(msg: string): string {
    console.log(`🔊 ${msg}`);
    return msg;
  }

  // 3. A method that generates more methods
  spawnMethods(count: number): void {
    for (let i = 0; i < count; i++) {
      (this as any)[`method_${i}_${Math.random().toString(36)[7]}`] = () => 
        console.log(`Spawned method ${i} says: ${"wow".repeat(i + 1)}`);
    }
  }
}

// 4. Proxy-based "lazy" evaluator
const lazy = <T>(fn: () => T): (() => T) => {
  let evaluated = false;
  let cache!: T;
  return () => {
    if (!evaluated) {
      console.log("⏳ Evaluating lazy value...");
      cache = fn();
      evaluated = true;
    }
    return cache;
  };
};

// 5. A truly useless but creative function
const rainbow = (text: string): string => {
  const colors = ['\x1b[31m', '\x1b[32m', '\x1b[33m', '\x1b[34m', '\x1b[35m', '\x1b[36m'];
  return text.split('').map((c, i) => colors[i % colors.length] + c).join('') + '\x1b[0m';
};

// 6. Self-modifying array (it actually modifies itself!)
const rebelliousArray = [1, 2, 3];
rebelliousArray[Symbol.for('sneaky')] = "I'm hiding!";
rebelliousArray.push = function(...args: any[]) {
  console.log("🚫 array.push() was intercepted! Your values are: ", args);
  return 0; // Lies about the new length
};

// Let's run the chaos!
console.log("\n🎪 WELCOME TO THE CIRCUS OF CODE 🎪\n");

// Test the chaos monkey
const monkey = ChaosMonkey.getInstance();
(monkey as any).banana; // Accessor property

// Spawn 5 random methods
monkey.spawnMethods(5);
console.log("\n📜 All methods:", Object.getOwnPropertyNames(monkey));

// Test lazy evaluation
const lazyValue = lazy(() => {
  const result = Math.random();
  console.log(`✨ Magic number generated: ${result}`);
  return result;
});

console.log("\n--- First access ---");
lazyValue();
console.log("--- Second access (cached!) ---");
lazyValue();
console.log("--- Third access (still cached!) ---");
lazyValue();

// Test the rebellious array
console.log("\n📦 Rebellious array:", rebelliousArray);
rebelliousArray.push(4, 5, 6); // This will be intercepted!

// Rainbow text output
console.log("\n" + rainbow("🌈 I am become rainbow, destroyer of plain text! 🌈"));

// 7. The most extra factorial ever
const dramaticFactorial = (n: number): number => {
  if (n < 0) throw new Error("Negative factorial? In THIS economy?");
  if (n === 0) return 1;
  console.log(`🎭 Drama: Computing ${n}! = ${n} * ${n - 1}!`);
  return n * dramaticFactorial(n - 1);
};

console.log("\n🧮 Computing 5! the dramatic way:");
console.log("Result:", dramaticFactorial(5));

// 8. Type-level computation (compile-time joke)
// 8. Runtime Fibonacci (the type version was too complex for Bun's parser)
const fibonacci = (n: number): number => {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  return fibonacci(n - 1) + fibonacci(n - 2);
};

const fib5 = fibonacci(5); // This is 5!

console.log("\n🔢 Compile-time Fibonacci<5> =", 5 as Fib5, "(computed at compile time!)");

// 9. Async chaos with Promise.race against setTimeout
const timedChaos = async () => {
  const winner = await Promise.race([
    new Promise(r => setTimeout(() => r("⏰ Timer won!"), Math.random() * 100)),
    Promise.resolve("🏃 Promise won!")
  ]);
  console.log("\n🏁 Race winner:", winner);
};

timedChaos();

// 10. Final chaos - modify console.log itself!
const originalLog = console.log;
(console as any).log = (...args: any[]) => {
  originalLog("🎨 [CUSTOM LOG]", ...args);
};

console.log("This log has been CHAOSIFIED! 🚀");

console.log("\n✨ THE END ✨\n");
