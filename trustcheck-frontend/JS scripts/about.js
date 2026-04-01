/*
Function to set the current year in the footer.
Paramaters:
- none: Uses the #year element from the page
Returns:
- none: Updates the footer text
*/
function setFooterYear()
{
    const yearElement = document.getElementById("year")

    if (!yearElement)
    {
        return
    }

    yearElement.textContent = new Date().getFullYear()
}

setFooterYear()
