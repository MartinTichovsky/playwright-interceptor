export const bigDataGenerator = (length = 4999) => {
    const result: unknown[] = [];

    for (let i = 0; i < length; i++) {
        result.push(createEntry(3));
    }

    return result;
};

const createEntry = (maxTree: number, currentTree = 1) => {
    const generator = [...generatorSimple, ...(currentTree < maxTree ? generatorExtended : [])];

    return generator[randomNumber(generator.length - 1)](maxTree, currentTree);
};

const generateArray = (maxTree: number, currentTree: number) => {
    const length = randomNumber(99);
    const result: unknown[] = [];

    for (let i = 0; i < length; i++) {
        result.push(createEntry(maxTree, currentTree + 1));
    }

    return result;
};

const generateBoolean = () => {
    return [true, false][randomNumber(1)];
};

const generateRandomObject = (maxTree: number, currentTree: number) => {
    const length = randomNumber(99);
    const result: Record<string, unknown> = {};

    for (let i = 0; i < length; i++) {
        result[stringGenerator(99)] = createEntry(maxTree, currentTree + 1);
    }

    return result;
};

const genereateNumber = () => {
    const dig = Math.pow(10, randomNumber(6));

    return Math.round(Math.random() * randomNumber(999999) * dig) / dig;
};

const generateString = () => {
    return stringGenerator(randomNumber(99));
};

const generatorSimple = [genereateNumber, generateString, generateBoolean];

const generatorExtended = [generateRandomObject, generateArray];

const randomNumber = (max: number) => {
    return Math.floor(Math.random() * max);
};

const stringGenerator = (length: number) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";

    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(randomNumber(chars.length - 1)));
    }

    return result;
};
