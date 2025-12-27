async function buildQueryAndParams(inputArr, arr) {
    return new Promise((resolve, reject) => {
        let query = "";
        let params = [];
        let filteredInputArr = [];

        inputArr.forEach((value, index) => {
            if (value !== "") {
                if (query !== "") {
                    query += " AND ";
                }
                query += arr[index];
                filteredInputArr.push(value);
                params.push(value);
            }
        });

        resolve({
            query: query,
            params: params,
            filteredInputArr: filteredInputArr
        });
    });
}

module.exports = buildQueryAndParams;